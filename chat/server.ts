import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI, Type } from "@google/genai";

// Supabase Client Initialization
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

let supabase: any = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*" },
    maxHttpBufferSize: 1e8 // 100MB
  });

  const PORT = 3000;

  // Middleware to check Supabase configuration
  app.use((req, res, next) => {
    if (!supabase && req.path.startsWith('/api')) {
      return res.status(500).json({ 
        error: "Supabase not configured", 
        details: "Please set SUPABASE_URL and SUPABASE_ANON_KEY in your environment variables to enable persistent storage." 
      });
    }
    next();
  });

  // API Routes
  app.post("/api/translate", async (req, res) => {
    const { text, targetLang, sourceLang, apiKey } = req.body;
    const effectiveKey = apiKey || process.env.GEMINI_API_KEY;
    
    if (!effectiveKey) {
      return res.status(500).json({ error: "Gemini API key not configured" });
    }

    try {
      const ai = new GoogleGenAI({ apiKey: effectiveKey });
      const model = "gemini-3-flash-preview";
      
      const prompt = `Translate the following text to ${targetLang}. 
      Source language is ${sourceLang || "detected automatically"}.
      Text: "${text}"`;

      const response = await ai.models.generateContent({
        model,
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              translatedText: { type: Type.STRING },
            },
            required: ["translatedText"],
          },
        },
      });

      res.json(JSON.parse(response.text || "{}"));
    } catch (e) {
      console.error("Translation error:", e);
      res.status(500).json({ error: "Translation failed" });
    }
  });

  app.post("/api/auth", async (req, res) => {
    const { email, username, language } = req.body;
    
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (!user) {
      const id = Math.random().toString(36).substr(2, 9);
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert([{ id, email, username, language, last_seen: Date.now() }])
        .select()
        .single();
      
      if (insertError) return res.status(500).json(insertError);
      res.json(newUser);
    } else {
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({ username, language, last_seen: Date.now() })
        .eq('id', user.id)
        .select()
        .single();
      
      if (updateError) return res.status(500).json(updateError);
      res.json(updatedUser);
    }
  });

  app.get("/api/contacts/:userId", async (req, res) => {
    const { userId } = req.params;
    
    // Get contacts for this user
    const { data: contactList, error: contactError } = await supabase
      .from('contacts')
      .select('contact_email')
      .eq('user_id', userId);
    
    if (contactError) return res.status(500).json(contactError);
    if (!contactList || contactList.length === 0) return res.json([]);
 
    const emails = contactList.map(c => c.contact_email);
 
    // Get user details for these contacts
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('*')
      .in('email', emails);

    if (userError) return res.status(500).json(userError);

    // For each user, get the last message (this is a bit heavy in Supabase without a custom RPC, 
    // but we'll do it simply for now)
    const contactsWithMessages = await Promise.all(users.map(async (u) => {
      const { data: lastMsg } = await supabase
        .from('messages')
        .select('text, timestamp')
        .or(`and(sender_id.eq.${u.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${u.id})`)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();
      
      return {
        ...u,
        last_message: lastMsg?.text || null,
        last_message_time: lastMsg?.timestamp || null
      };
    }));

    res.json(contactsWithMessages);
  });

  app.post("/api/contacts", async (req, res) => {
    const { userId, contactEmail } = req.body;
    try {
      const { error } = await supabase
        .from('contacts')
        .insert([{ user_id: userId, contact_email: contactEmail }]);
      
      if (error) throw error;
 
      const { data: contact } = await supabase
        .from('users')
        .select('*')
        .eq('email', contactEmail)
        .single();
 
      res.json(contact || { email: contactEmail, status: "pending" });
    } catch (e) {
      res.status(400).json({ error: "Already added or error" });
    }
  });

  app.get("/api/messages/:userId/:otherId", async (req, res) => {
    const { userId, otherId } = req.params;
    
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${userId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${userId})`)
      .order('timestamp', { ascending: true });
    
    if (error) return res.status(500).json(error);

    // Mark as read
    await supabase
      .from('messages')
      .update({ is_read: 1 })
      .eq('sender_id', otherId)
      .eq('receiver_id', userId);
      
    res.json(messages);
  });

  // Socket.io logic
  const userSockets = new Map<string, string>(); // userId -> socketId

  io.on("connection", (socket) => {
    socket.on("register", (userId: string) => {
      userSockets.set(userId, socket.id);
      socket.data.userId = userId;
      io.emit("user_status", { userId, status: "online" });
    });

    socket.on("send_private_message", async (data: { 
      senderId: string; 
      receiverId: string; 
      text?: string; 
      imageData?: string;
      senderLang: string;
      senderName: string;
    }) => {
      const msgId = Math.random().toString(36).substr(2, 9);
      const timestamp = Date.now();

      // Persist message to Supabase
      if (supabase) {
        await supabase
          .from('messages')
          .insert([{
            id: msgId,
            sender_id: data.senderId,
            receiver_id: data.receiverId,
            text: data.text || null,
            image_data: data.imageData || null,
            sender_lang: data.senderLang,
            timestamp
          }]);
      }

      // Send to receiver if online
      const receiverSocketId = userSockets.get(data.receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("receive_private_message", {
          id: msgId,
          senderId: data.senderId,
          senderName: data.senderName,
          text: data.text,
          imageData: data.imageData,
          senderLang: data.senderLang,
          timestamp
        });
      }
    });

    socket.on("typing", (data: { senderId: string; receiverId: string; isTyping: boolean }) => {
      const receiverSocketId = userSockets.get(data.receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("typing_status", { senderId: data.senderId, isTyping: data.isTyping });
      }
    });

    socket.on("mark_read", async (data: { userId: string; otherId: string }) => {
      if (supabase) {
        await supabase
          .from('messages')
          .update({ is_read: 1 })
          .eq('sender_id', data.otherId)
          .eq('receiver_id', data.userId);
      }
      
      const otherSocketId = userSockets.get(data.otherId);
      if (otherSocketId) {
        io.to(otherSocketId).emit("messages_read", { readerId: data.userId });
      }
    });

    // WebRTC Signaling
    socket.on("call_user", (data: { offer: any; to: string; from: string; fromName: string; type: 'audio' | 'video' }) => {
      const receiverSocketId = userSockets.get(data.to);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("incoming_call", { offer: data.offer, from: data.from, fromName: data.fromName, type: data.type });
      }
    });

    socket.on("answer_call", (data: { answer: any; to: string }) => {
      const receiverSocketId = userSockets.get(data.to);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("call_accepted", { answer: data.answer });
      }
    });

    socket.on("ice_candidate", (data: { candidate: any; to: string }) => {
      const receiverSocketId = userSockets.get(data.to);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("ice_candidate", { candidate: data.candidate });
      }
    });

    socket.on("end_call", (data: { to: string }) => {
      const receiverSocketId = userSockets.get(data.to);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("call_ended");
      }
    });

    socket.on("disconnect", async () => {
      if (socket.data.userId) {
        const userId = socket.data.userId;
        userSockets.delete(userId);
        const now = Date.now();
        io.emit("user_status", { userId, status: "offline", lastSeen: now });
        if (supabase) {
          await supabase
            .from('users')
            .update({ last_seen: now })
            .eq('id', userId);
        }
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
