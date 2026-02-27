import React, { useState, useRef, useEffect } from 'react';
import { 
  Languages, 
  Volume2, 
  Camera, 
  History, 
  ArrowRightLeft, 
  Copy, 
  Check, 
  Mic, 
  MicOff,
  Sparkles,
  Info,
  X,
  Loader2,
  ChevronDown,
  Trash2,
  Send,
  User,
  MessageSquare,
  Globe,
  Settings,
  Plus,
  Phone,
  Search,
  MoreVertical,
  ArrowLeft,
  Image as ImageIcon,
  Paperclip,
  Smile,
  CheckCheck,
  Video,
  PhoneOff,
  Lock,
  ShieldCheck,
  Mail
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { io, Socket } from 'socket.io-client';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'tr', name: 'Turkish' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'th', name: 'Thai' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' },
  { code: 'sv', name: 'Swedish' },
  { code: 'da', name: 'Danish' },
  { code: 'fi', name: 'Finnish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'cs', name: 'Czech' },
  { code: 'el', name: 'Greek' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'ro', name: 'Romanian' },
  { code: 'sk', name: 'Slovak' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'he', name: 'Hebrew' },
  { code: 'id', name: 'Indonesian' },
  { code: 'ms', name: 'Malay' },
  { code: 'bn', name: 'Bengali' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
];

interface ChatMessage {
  id: string;
  text?: string;
  imageData?: string;
  translatedText?: string;
  senderId: string;
  senderName: string;
  senderLang: string;
  timestamp: number;
  isMe: boolean;
  isTranslating?: boolean;
  is_read?: number;
}

interface Contact {
  id: string;
  email: string;
  username: string;
  language: string;
  last_seen?: number;
  last_message?: string;
  last_message_time?: number;
  status?: 'online' | 'offline';
  isTyping?: boolean;
}

export default function App() {
  const [user, setUser] = useState<Contact | null>(null);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [userLang, setUserLang] = useState('en');
  const [isJoined, setIsJoined] = useState(false);
  const [userApiKey, setUserApiKey] = useState('');
  
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isSpeaking, setIsSpeaking] = useState<string | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactEmail, setNewContactEmail] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  
  // Call State
  const [activeCall, setActiveCall] = useState<{
    from: string;
    fromName: string;
    type: 'audio' | 'video';
    isIncoming: boolean;
    status: 'ringing' | 'connected';
  } | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<any>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const ICE_SERVERS = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  };

  // Auth & Init
  useEffect(() => {
    const savedUser = localStorage.getItem('linguist_user');
    if (savedUser) {
      const u = JSON.parse(savedUser);
      setUser(u);
      setUsername(u.username);
      setEmail(u.email);
      setUserLang(u.language);
      setIsJoined(true);
    }
    const savedKey = localStorage.getItem('linguist_user_api_key');
    if (savedKey) setUserApiKey(savedKey);
  }, []);

  useEffect(() => {
    if (isJoined && user) {
      const newSocket = io();
      setSocket(newSocket);
      newSocket.emit('register', user.id);

      newSocket.on('receive_private_message', async (data: any) => {
        const incomingMsg: ChatMessage = {
          ...data,
          isMe: false,
          isTranslating: data.text && data.senderLang !== user.language
        };
        
        setMessages(prev => [...prev, incomingMsg]);

        if (data.text && data.senderLang !== user.language) {
          try {
            const result = await translateText(data.text, user.language, data.senderLang);
            setMessages(prev => prev.map(m => 
              m.id === data.id 
                ? { ...m, translatedText: result.translatedText, isTranslating: false } 
                : m
            ));
          } catch (error) {
            console.error("Translation error:", error);
            setMessages(prev => prev.map(m => 
              m.id === data.id ? { ...m, isTranslating: false } : m
            ));
          }
        }

        if (activeContact?.id === data.senderId) {
          newSocket.emit('mark_read', { userId: user.id, otherId: data.senderId });
        }
        
        fetchContacts(user.id);
      });

      newSocket.on('typing_status', (data: { senderId: string; isTyping: boolean }) => {
        setContacts(prev => prev.map(c => 
          c.id === data.senderId ? { ...c, isTyping: data.isTyping } : c
        ));
      });

      newSocket.on('user_status', (data: { userId: string; status: 'online' | 'offline'; lastSeen?: number }) => {
        setContacts(prev => prev.map(c => 
          c.id === data.userId ? { ...c, status: data.status, last_seen: data.lastSeen || c.last_seen } : c
        ));
      });

      newSocket.on('messages_read', (data: { readerId: string }) => {
        if (activeContact?.id === data.readerId) {
          setMessages(prev => prev.map(m => m.isMe ? { ...m, is_read: 1 } : m));
        }
      });

      newSocket.on('incoming_call', async (data: any) => {
        setActiveCall({
          from: data.from,
          fromName: data.fromName,
          type: data.type,
          isIncoming: true,
          status: 'ringing'
        });
        (window as any).pendingOffer = data.offer;
      });

      newSocket.on('call_accepted', async (data: any) => {
        if (peerConnection.current) {
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.answer));
          setActiveCall(prev => prev ? { ...prev, status: 'connected' } : null);
        }
      });

      newSocket.on('ice_candidate', async (data: any) => {
        if (peerConnection.current) {
          try {
            await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (e) {
            console.error("Error adding ice candidate", e);
          }
        }
      });

      newSocket.on('call_ended', () => {
        cleanupCall();
      });

      fetchContacts(user.id);

      return () => {
        newSocket.close();
      };
    }
  }, [isJoined]);

  useEffect(() => {
    if (activeContact && user) {
      fetchMessages(user.id, activeContact.id);
      socket?.emit('mark_read', { userId: user.id, otherId: activeContact.id });
    } else {
      setMessages([]);
    }
  }, [activeContact]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchContacts = async (userId: string) => {
    try {
      const res = await fetch(`/api/contacts/${userId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setContacts(data);
      } else {
        console.error("Contacts data is not an array:", data);
        setContacts([]);
      }
    } catch (e) {
      console.error(e);
      setContacts([]);
    }
  };

  const fetchMessages = async (userId: string, otherId: string) => {
    try {
      const res = await fetch(`/api/messages/${userId}/${otherId}`);
      const data = await res.json();
      
      if (!Array.isArray(data)) {
        console.error("Messages data is not an array:", data);
        setMessages([]);
        return;
      }

      const formattedMessages = data.map((m: any) => ({
        id: m.id,
        text: m.text,
        imageData: m.image_data,
        senderId: m.sender_id,
        senderName: m.sender_id === userId ? user?.username : activeContact?.username,
        senderLang: m.sender_lang,
        timestamp: m.timestamp,
        isMe: m.sender_id === userId,
        is_read: m.is_read
      }));
      
      const translated = await Promise.all(formattedMessages.map(async (m: any) => {
        if (!m.isMe && m.text && m.senderLang !== user?.language) {
          try {
            const result = await translateText(m.text, user!.language, m.senderLang);
            return { ...m, translatedText: result.translatedText };
          } catch (e) {
            return m;
          }
        }
        return m;
      }));
      setMessages(translated);
    } catch (e) {
      console.error(e);
    }
  };

  const translateText = async (text: string, targetLang: string, sourceLang: string) => {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, targetLang, sourceLang, apiKey: userApiKey })
    });
    return res.json();
  };

  const handleAuth = async () => {
    if (!email || !username) return;
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, language: userLang })
      });
      const data = await res.json();
      setUser(data);
      localStorage.setItem('linguist_user', JSON.stringify(data));
      if (userApiKey) {
        localStorage.setItem('linguist_user_api_key', userApiKey);
      } else {
        localStorage.removeItem('linguist_user_api_key');
      }
      setIsJoined(true);
      setShowProfile(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddContact = async () => {
    console.log("Attempting to add contact:", newContactEmail);
    if (!newContactEmail || !user) {
      console.warn("Missing email or user:", { newContactEmail, user });
      alert("Please enter an email address and ensure you are logged in.");
      return;
    }
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, contactEmail: newContactEmail })
      });
      if (res.ok) {
        console.log("Contact added successfully");
        fetchContacts(user.id);
        setShowAddContact(false);
        setNewContactEmail('');
      } else {
        const errorData = await res.json();
        console.error("Failed to add contact:", errorData);
        alert(errorData.error || "Failed to add contact");
      }
    } catch (e) {
      console.error("Error adding contact:", e);
      alert("An error occurred while adding the contact");
    }
  };

  const handleTyping = () => {
    if (!socket || !user || !activeContact) return;
    socket.emit('typing', { senderId: user.id, receiverId: activeContact.id, isTyping: true });
    
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing', { senderId: user.id, receiverId: activeContact.id, isTyping: false });
    }, 2000);
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newMessage.trim() || !socket || !user || !activeContact) return;

    const msgData = {
      senderId: user.id,
      senderName: user.username,
      receiverId: activeContact.id,
      text: newMessage,
      senderLang: user.language,
      timestamp: Date.now()
    };

    socket.emit('send_private_message', msgData);
    setMessages(prev => [...prev, { ...msgData, isMe: true, id: Math.random().toString(36).substr(2, 9) }]);
    setNewMessage('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !socket || !user || !activeContact) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const msgData = {
        senderId: user.id,
        senderName: user.username,
        receiverId: activeContact.id,
        imageData: base64String,
        senderLang: user.language,
        timestamp: Date.now()
      };
      socket.emit('send_private_message', msgData);
      setMessages(prev => [...prev, { ...msgData, isMe: true, id: Math.random().toString(36).substr(2, 9) }]);
    };
    reader.readAsDataURL(file);
  };

  const startCall = async (type: 'audio' | 'video') => {
    if (!socket || !user || !activeContact) return;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video'
      });
      setLocalStream(stream);
      
      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnection.current = pc;
      
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      
      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      socket.emit('call_user', {
        offer,
        to: activeContact.id,
        from: user.id,
        fromName: user.username,
        type
      });
      
      setActiveCall({
        from: activeContact.id,
        fromName: activeContact.username,
        type,
        isIncoming: false,
        status: 'ringing'
      });
    } catch (e) {
      console.error("Failed to start call", e);
      alert("Could not access camera/microphone");
    }
  };

  const answerCall = async () => {
    if (!socket || !activeCall) return;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: activeCall.type === 'video'
      });
      setLocalStream(stream);
      
      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnection.current = pc;
      
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      
      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
        }
      };

      const offer = (window as any).pendingOffer;
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      socket.emit('answer_call', { answer, to: activeCall.from });
      setActiveCall(prev => prev ? { ...prev, status: 'connected' } : null);
    } catch (e) {
      console.error("Failed to answer call", e);
      cleanupCall();
    }
  };

  const cleanupCall = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    setRemoteStream(null);
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    setActiveCall(null);
    delete (window as any).pendingOffer;
  };

  const rejectCall = () => {
    if (activeCall && socket) {
      socket.emit('end_call', { to: activeCall.from });
    }
    cleanupCall();
  };

  const endCall = () => {
    if (activeCall && socket) {
      socket.emit('end_call', { to: activeCall.from });
    }
    cleanupCall();
  };

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-[#F0F2F5] flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white w-full max-w-md rounded-[32px] shadow-xl overflow-hidden"
        >
          <div className="bg-[#00a884] p-8 text-white text-center">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-md">
              <Globe className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold">Linguist Chat</h1>
            <p className="text-white/80 text-sm mt-1">Global Messaging, Local Language</p>
            <div className="mt-4 inline-block px-3 py-1 bg-white/20 rounded-full text-[10px] font-bold uppercase tracking-widest backdrop-blur-sm">
              Free Forever Web App
            </div>
          </div>
          
          <div className="p-8 space-y-6">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 block ml-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input 
                  type="email" 
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-gray-50 border border-black/5 rounded-2xl pl-12 pr-4 py-4 focus:outline-none focus:ring-2 focus:ring-[#00a884]/20 transition-all h-[58px]"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 block ml-1">Display Name</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Enter your name..."
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-gray-50 border border-black/5 rounded-2xl pl-12 pr-4 py-4 focus:outline-none focus:ring-2 focus:ring-[#00a884]/20 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 block ml-1">Your Language</label>
              <div className="relative">
                <Languages className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <select 
                  value={userLang}
                  onChange={(e) => setUserLang(e.target.value)}
                  className="w-full bg-gray-50 border border-black/5 rounded-2xl pl-12 pr-10 py-4 appearance-none focus:outline-none focus:ring-2 focus:ring-[#00a884]/20 transition-all cursor-pointer"
                >
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            <button 
              onClick={handleAuth}
              disabled={!username || !email}
              className="w-full bg-[#00a884] hover:bg-[#008f70] disabled:bg-gray-300 text-white py-4 rounded-2xl font-bold transition-all shadow-lg active:scale-[0.98]"
            >
              Start Chatting
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#F0F2F5] flex overflow-hidden">
      {/* Sidebar */}
      <div className={cn(
        "w-full sm:w-[350px] md:w-[400px] bg-white border-r border-black/5 flex flex-col shrink-0 transition-all",
        activeContact && "hidden sm:flex"
      )}>
        <header className="h-16 bg-[#F0F2F5] px-4 flex items-center justify-between shrink-0">
          <button 
            onClick={() => setShowProfile(true)}
            className="w-10 h-10 bg-[#00a884] rounded-full flex items-center justify-center overflow-hidden text-white font-bold"
          >
            {user?.username?.[0]?.toUpperCase()}
          </button>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                console.log("Opening Add Contact Modal");
                setShowAddContact(true);
              }}
              className="p-2 hover:bg-black/5 rounded-full transition-colors text-gray-600"
            >
              <Plus className="w-5 h-5" />
            </button>
            <button className="p-2 hover:bg-black/5 rounded-full transition-colors text-gray-600">
              <MoreVertical className="w-5 h-5" />
            </button>
          </div>
        </header>

        <div className="p-3 bg-white">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search or start new chat"
              className="w-full bg-gray-100 border-none rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-0"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {contacts.map(contact => (
            <button 
              key={contact.id}
              onClick={() => setActiveContact(contact)}
              className={cn(
                "w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors border-b border-black/5",
                activeContact?.id === contact.id && "bg-gray-100"
              )}
            >
              <div className="relative">
                <div className="w-12 h-12 bg-[#00a884] rounded-full flex items-center justify-center text-white font-bold text-lg">
                  {contact.username?.[0]?.toUpperCase()}
                </div>
                {contact.status === 'online' && (
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full" />
                )}
              </div>
              <div className="flex-1 text-left">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm">{contact.username}</h3>
                  <span className="text-[10px] text-gray-400">
                    {contact.last_message_time ? new Date(contact.last_message_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 truncate max-w-[180px]">
                    {contact.isTyping ? <span className="text-emerald-500 font-bold italic">typing...</span> : (contact.last_message || contact.email)}
                  </p>
                </div>
              </div>
            </button>
          ))}
          {contacts.length === 0 && (
            <div className="p-8 text-center text-gray-400">
              <p className="text-sm">No contacts yet.</p>
              <button 
                onClick={() => {
                  console.log("Opening Add Contact Modal from empty state");
                  setShowAddContact(true);
                }}
                className="text-[#00a884] font-bold mt-2 hover:underline"
              >
                Add your first contact
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-[#E5DDD5] relative">
        {activeContact ? (
          <>
            <header className="h-16 bg-[#F0F2F5] px-4 flex items-center justify-between shrink-0 z-10 shadow-sm">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setActiveContact(null)}
                  className="sm:hidden p-2 -ml-2 hover:bg-black/5 rounded-full"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="w-10 h-10 bg-[#00a884] rounded-full flex items-center justify-center text-white font-bold">
                  {activeContact.username?.[0]?.toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-sm">{activeContact.username}</h3>
                  <p className="text-[10px] text-gray-500">
                    {activeContact.status === 'online' ? 'online' : activeContact.last_seen ? `last seen ${new Date(activeContact.last_seen).toLocaleTimeString()}` : 'offline'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button onClick={() => startCall('audio')} className="p-2 hover:bg-black/5 rounded-full transition-colors text-gray-600">
                  <Phone className="w-5 h-5" />
                </button>
                <button onClick={() => startCall('video')} className="p-2 hover:bg-black/5 rounded-full transition-colors text-gray-600">
                  <Video className="w-5 h-5" />
                </button>
                <button className="p-2 hover:bg-black/5 rounded-full transition-colors text-gray-600">
                  <Search className="w-5 h-5" />
                </button>
                <button className="p-2 hover:bg-black/5 rounded-full transition-colors text-gray-600">
                  <MoreVertical className="w-5 h-5" />
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat">
              {messages.map((msg, i) => (
                <div 
                  key={msg.id || i}
                  className={cn(
                    "flex flex-col max-w-[85%] sm:max-w-[70%]",
                    msg.isMe ? "ml-auto items-end" : "mr-auto items-start"
                  )}
                >
                  <div className={cn(
                    "p-2 rounded-lg shadow-sm relative group",
                    msg.isMe ? "bg-[#dcf8c6] rounded-tr-none" : "bg-white rounded-tl-none"
                  )}>
                    {msg.imageData && (
                      <img src={msg.imageData} alt="Sent" className="max-w-full rounded-lg mb-2 cursor-pointer hover:opacity-90 transition-opacity" />
                    )}
                    {msg.text && (
                      <div className="pr-12">
                        <p className="text-sm text-gray-800 leading-relaxed">{msg.text}</p>
                        {msg.translatedText && (
                          <div className="mt-2 pt-2 border-t border-black/5">
                            <div className="flex items-center gap-1.5 mb-1">
                              <Languages className="w-3 h-3 text-[#00a884]" />
                              <span className="text-[10px] font-bold text-[#00a884] uppercase tracking-wider">Translated</span>
                            </div>
                            <p className="text-sm text-gray-600 italic leading-relaxed">{msg.translatedText}</p>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="absolute bottom-1 right-2 flex items-center gap-1">
                      <span className="text-[9px] text-gray-400">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {msg.isMe && (
                        <CheckCheck className={cn("w-3 h-3", msg.is_read ? "text-blue-500" : "text-gray-400")} />
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <footer className="bg-[#F0F2F5] p-3 flex items-center gap-2 shrink-0">
              <button className="p-2 hover:bg-black/5 rounded-full text-gray-600">
                <Smile className="w-6 h-6" />
              </button>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="p-2 hover:bg-black/5 rounded-full text-gray-600"
              >
                <Paperclip className="w-6 h-6" />
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleFileUpload}
              />
              <form onSubmit={handleSendMessage} className="flex-1 flex items-center gap-2">
                <input 
                  type="text" 
                  placeholder="Type a message"
                  value={newMessage}
                  onChange={(e) => {
                    setNewMessage(e.target.value);
                    handleTyping();
                  }}
                  className="flex-1 bg-white border-none rounded-xl px-4 py-2.5 text-sm focus:ring-0 shadow-sm"
                />
                <button 
                  type="submit"
                  disabled={!newMessage.trim()}
                  className="p-2.5 bg-[#00a884] text-white rounded-full shadow-md hover:bg-[#008f70] transition-colors disabled:bg-gray-300"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
              <button className="p-2 hover:bg-black/5 rounded-full text-gray-600">
                <Mic className="w-6 h-6" />
              </button>
            </footer>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-[#F8F9FA]">
            <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center mb-6">
              <Globe className="w-12 h-12 text-[#00a884]" />
            </div>
            <h2 className="text-3xl font-light text-gray-800 mb-4">Linguist Web</h2>
            <p className="text-gray-500 max-w-md leading-relaxed mb-8">
              Send and receive messages in any language. Your messages are automatically translated for your contacts.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg">
              <div className="flex items-center gap-3 text-left">
                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
                  <Languages className="w-5 h-5 text-[#00a884]" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-800">Auto-Translation</h4>
                  <p className="text-xs text-gray-500">Conversations are strictly between you and your contact.</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-left">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-800">Dedicated Identity</h4>
                  <p className="text-xs text-gray-500">Your email address is your unique, secure identifier.</p>
                </div>
              </div>
            </div>

            <div className="mt-12 flex items-center gap-2 text-gray-400">
              <Lock className="w-3 h-3" />
              <span className="text-[10px] font-bold uppercase tracking-widest">End-to-end private messaging</span>
            </div>
          </div>
        )}
      </div>

      {/* Profile Modal */}
      <AnimatePresence>
        {showProfile && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6">
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-white w-full max-w-md rounded-t-[32px] sm:rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="bg-[#00a884] p-8 text-white relative">
                <button 
                  onClick={() => setShowProfile(false)}
                  className="absolute top-6 right-6 p-2 hover:bg-white/20 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
                <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center text-4xl font-bold mb-4 backdrop-blur-md">
                  {user?.username?.[0]?.toUpperCase()}
                </div>
                <h2 className="text-2xl font-bold">{user?.username}</h2>
                <p className="text-white/80">{user?.email}</p>
              </div>
              <div className="p-8 space-y-6">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 block">Your Language</label>
                  <div className="relative">
                    <Languages className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <select 
                      value={userLang}
                      onChange={(e) => setUserLang(e.target.value)}
                      className="w-full bg-gray-50 border border-black/5 rounded-2xl pl-12 pr-10 py-4 appearance-none focus:outline-none focus:ring-2 focus:ring-[#00a884]/20 transition-all cursor-pointer"
                    >
                      {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <button 
                  onClick={() => {
                    localStorage.removeItem('linguist_user');
                    setIsJoined(false);
                    setUser(null);
                    setShowProfile(false);
                  }}
                  className="w-full bg-red-50 text-red-600 py-4 rounded-2xl font-bold hover:bg-red-100 transition-colors"
                >
                  Log Out
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Call UI */}
      <AnimatePresence>
        {activeCall && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 z-[200] flex flex-col items-center justify-center p-6 backdrop-blur-xl"
          >
            <div className="relative w-full max-w-4xl aspect-video bg-gray-900 rounded-[32px] overflow-hidden shadow-2xl border border-white/10">
              {activeCall.type === 'video' ? (
                <>
                  <video 
                    ref={remoteVideoRef} 
                    autoPlay 
                    playsInline 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-6 right-6 w-48 aspect-video bg-black rounded-2xl overflow-hidden border-2 border-white/20 shadow-xl">
                    <video 
                      ref={localVideoRef} 
                      autoPlay 
                      playsInline 
                      muted 
                      className="w-full h-full object-cover"
                    />
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center">
                  <div className="w-32 h-32 bg-[#00a884] rounded-full flex items-center justify-center text-white text-4xl font-bold mb-8 animate-pulse shadow-[0_0_50px_rgba(0,168,132,0.3)]">
                    {activeCall.fromName?.[0]?.toUpperCase()}
                  </div>
                  <h2 className="text-3xl font-bold text-white mb-2">{activeCall.fromName}</h2>
                  <p className="text-emerald-500 font-medium tracking-widest uppercase text-sm">
                    {activeCall.status === 'ringing' ? 'Ringing...' : 'In Call'}
                  </p>
                </div>
              )}

              <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-8">
                {activeCall.isIncoming && activeCall.status === 'ringing' ? (
                  <>
                    <button 
                      onClick={answerCall}
                      className="w-20 h-20 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-2xl hover:bg-emerald-600 transition-all hover:scale-110 active:scale-95 group"
                    >
                      {activeCall.type === 'video' ? <Video className="w-8 h-8 group-hover:rotate-12 transition-transform" /> : <Phone className="w-8 h-8 group-hover:rotate-12 transition-transform" />}
                    </button>
                    <button 
                      onClick={rejectCall}
                      className="w-20 h-20 bg-red-500 text-white rounded-full flex items-center justify-center shadow-2xl hover:bg-red-600 transition-all hover:scale-110 active:scale-95 group"
                    >
                      <PhoneOff className="w-8 h-8 group-hover:-rotate-12 transition-transform" />
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={endCall}
                    className="w-20 h-20 bg-red-500 text-white rounded-full flex items-center justify-center shadow-2xl hover:bg-red-600 transition-all hover:scale-110 active:scale-95 group"
                  >
                    <PhoneOff className="w-8 h-8 group-hover:-rotate-12 transition-transform" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Contact Modal */}
      <AnimatePresence>
        {showAddContact && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-sm rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-black/5 flex items-center justify-between">
                <h3 className="font-bold">Add New Contact</h3>
                <button onClick={() => setShowAddContact(false)} className="p-2 hover:bg-black/5 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 block ml-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                      type="email" 
                      placeholder="contact@email.com"
                      value={newContactEmail}
                      onChange={(e) => setNewContactEmail(e.target.value)}
                      className="w-full bg-gray-50 border border-black/5 rounded-2xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#00a884]/20 h-[58px]"
                    />
                  </div>
                </div>
                <button 
                  onClick={handleAddContact}
                  className="w-full bg-[#00a884] text-white py-3 rounded-2xl font-bold shadow-lg"
                >
                  Add Contact
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
