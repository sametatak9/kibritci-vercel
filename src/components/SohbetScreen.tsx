import React, { useState, useEffect, useRef } from 'react';
import { Send, Users, ShieldCheck, UserPlus, FileText, Check, MessageCircle, Info, Megaphone } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, addDoc, onSnapshot, query, orderBy, limit } from 'firebase/firestore';

interface SohbetScreenProps {
  currentUser: any;
  kullanicilar: any[];
}

interface Message {
  id: string;
  senderName: string;
  senderEmail: string;
  senderRole: string;
  text: string;
  timestamp: any;
  tag?: string;
}

export const SohbetScreen: React.FC<SohbetScreenProps> = ({ currentUser, kullanicilar }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [selectedTag, setSelectedTag] = useState("GENEL");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Quick message tags
  const tags = [
    { key: "GENEL", label: "💬 Genel", color: "bg-slate-100 text-slate-800 border-slate-200" },
    { key: "ONAY", label: "🛡️ Onay Talebi", color: "bg-amber-50 text-amber-800 border-amber-200" },
    { key: "GIRIS", label: "👷 İşçi Girişi", color: "bg-emerald-50 text-emerald-800 border-emerald-200" },
    { key: "IZIN", label: "📅 İzin & Sevk", color: "bg-blue-50 text-blue-800 border-blue-200" },
    { key: "MALZEME", label: "📦 Malzeme", color: "bg-purple-50 text-purple-800 border-purple-200" },
  ];

  // Subscribe to real-time chat messages
  useEffect(() => {
    const q = query(
      collection(db, 'santiyeMesajlari'),
      orderBy('timestamp', 'asc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Message[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          id: doc.id,
          senderName: data.senderName || data.senderEmail?.split('@')[0].toUpperCase() || "BİLİNMEYEN",
          senderEmail: data.senderEmail || "",
          senderRole: data.senderRole || "GÖREVLİ",
          text: data.text || "",
          timestamp: data.timestamp ? data.timestamp.toDate() : new Date(),
          tag: data.tag || "GENEL"
        });
      });
      setMessages(list);
    });

    return () => unsubscribe();
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    const matchedUser = kullanicilar.find(u => u.email?.toLowerCase() === currentUser?.email?.toLowerCase());
    const senderRole = matchedUser?.yetki || "GÖREVLİ";
    const senderName = matchedUser?.ad && matchedUser?.soyad ? `${matchedUser.ad} ${matchedUser.soyad}` : currentUser?.email?.split('@')[0].toUpperCase();

    try {
      await addDoc(collection(db, 'santiyeMesajlari'), {
        senderName,
        senderEmail: currentUser?.email || "anonim@kibritci.com",
        senderRole,
        text: inputText,
        tag: selectedTag,
        timestamp: new Date()
      });
      setInputText("");
    } catch (err) {
      console.error("Mesaj gönderilemedi:", err);
      alert("Mesaj gönderilirken bağlantı hatası oluştu.");
    }
  };

  const shareTemplate = (type: string) => {
    let msg = "";
    if (type === "onay") {
      msg = "Yeni bir Satın Alma faturası onay havuzuna gönderilmiştir. Sayın yöneticilerimiz, lütfen 'Onay Havuzu & İmzalar' sekmesinden kontrol ediniz.";
    } else if (type === "giris") {
      msg = "Saha kapısına yeni bir personel girişi yapılmış olup, kimlik fotoğrafları ile WhatsApp onay talebi oluşturulmuştur.";
    } else if (type === "izin") {
      msg = "Saha ekibinden bir personel için sevk ve izin formu doldurulmuş, onay için koordinatörlüğe sunulmuştur.";
    }
    setInputText(msg);
  };

  return (
    <div className="flex-grow p-6 h-[calc(100vh-52px)] overflow-hidden flex gap-6 font-sans select-none bg-slate-50/50">
      {/* Left Column: Chat Conversation */}
      <div className="flex-1 bg-white border border-slate-200 rounded-3xl flex flex-col overflow-hidden shadow-sm">
        {/* Header bar */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <MessageCircle size={18} className="text-blue-600 animate-pulse" />
            <div>
              <h4 className="font-display font-bold text-slate-800 text-sm uppercase tracking-wider">Kibritçi İletişim &amp; Sohbet Odası</h4>
              <p className="text-[10px] text-slate-400 font-medium">Tüm şantiye, idari kadro ve yönetim arasında anlık, güvenli mesajlaşma hattı</p>
            </div>
          </div>
          <span className="bg-blue-50 text-blue-800 text-[9px] font-bold px-2 py-0.5 rounded-full border border-blue-100">
            Canlı NoSQL Bağlantısı
          </span>
        </div>

        {/* Message area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/30">
          {messages.map((msg) => {
            const isMe = msg.senderEmail?.toLowerCase() === currentUser?.email?.toLowerCase();
            const tagStyle = tags.find(t => t.key === msg.tag) || tags[0];

            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-200`}>
                <div className={`max-w-[70%] rounded-2xl p-3.5 shadow-xs border ${
                  isMe 
                    ? 'bg-blue-600 text-white border-blue-500 rounded-tr-none' 
                    : 'bg-white text-slate-800 border-slate-200 rounded-tl-none'
                }`}>
                  {/* Sender header */}
                  <div className="flex items-center space-x-2 mb-1 border-b pb-1 border-white/10">
                    <span className={`text-[9px] font-bold tracking-tight uppercase ${isMe ? 'text-blue-200' : 'text-slate-500'}`}>
                      {msg.senderName}
                    </span>
                    <span className={`text-[8px] px-1 rounded font-mono ${isMe ? 'bg-blue-700 text-blue-100' : 'bg-slate-100 text-slate-600'}`}>
                      {msg.senderRole}
                    </span>
                    {msg.tag && msg.tag !== 'GENEL' && (
                      <span className="text-[8.5px] px-1 bg-white/20 rounded text-[9px] font-semibold">
                        #{msg.tag}
                      </span>
                    )}
                  </div>

                  {/* Text */}
                  <p className="text-[11.5px] whitespace-pre-wrap leading-relaxed font-medium break-words">
                    {msg.text}
                  </p>

                  {/* Timestamp */}
                  <div className={`text-right text-[8.5px] mt-1.5 font-semibold ${isMe ? 'text-blue-200' : 'text-slate-400'}`}>
                    {new Date(msg.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            );
          })}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2">
              <Megaphone size={28} className="text-slate-300" />
              <p className="text-xs font-bold italic">Sohbet odası henüz boş. İlk mesajı siz yazın!</p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-100 bg-white space-y-3">
          {/* Tag Selector */}
          <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-[9px] font-bold text-slate-450 uppercase tracking-wider shrink-0 mr-1">Konu Başlığı:</span>
            {tags.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setSelectedTag(t.key)}
                className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold border transition cursor-pointer shrink-0 ${
                  selectedTag === t.key 
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs' 
                    : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Şantiye ekibine anlık mesaj gönderin..."
              className="flex-1 bg-slate-50 border border-slate-200 text-xs rounded-xl p-2.5 outline-none focus:bg-white focus:border-blue-500 transition font-medium"
            />
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-extrabold text-xs py-2.5 px-4 rounded-xl shadow transition duration-150 flex items-center space-x-1 cursor-pointer shrink-0"
            >
              <Send size={13} />
              <span>Gönder</span>
            </button>
          </div>
        </form>
      </div>

      {/* Right Column: Information & Active Channels */}
      <div className="w-72 shrink-0 bg-white border border-slate-200 rounded-3xl p-5 flex flex-col space-y-5 shadow-sm">
        <div className="border-b pb-3">
          <h5 className="font-bold text-slate-800 text-xs uppercase tracking-wider">📢 Hızlı Şablon Gönderimi</h5>
          <p className="text-[9.5px] text-slate-400 font-semibold mt-1">Sık yapılan şantiye işleri için hazır duyuru şablonları:</p>
        </div>

        <div className="space-y-2.5">
          <button
            onClick={() => shareTemplate("onay")}
            className="w-full text-left p-2.5 rounded-xl border border-amber-100 bg-amber-50/50 hover:bg-amber-50 transition text-[10px] font-bold text-amber-900 flex items-center space-x-2 cursor-pointer"
          >
            <ShieldCheck size={13} className="text-amber-600 shrink-0" />
            <div className="leading-tight">
              <span>Onay Talebi Bildirisi</span>
              <p className="text-[8px] text-slate-400 font-semibold">Onay havuzunu duyurur</p>
            </div>
          </button>

          <button
            onClick={() => shareTemplate("giris")}
            className="w-full text-left p-2.5 rounded-xl border border-emerald-100 bg-emerald-50/50 hover:bg-emerald-50 transition text-[10px] font-bold text-emerald-900 flex items-center space-x-2 cursor-pointer"
          >
            <UserPlus size={13} className="text-emerald-650 shrink-0" />
            <div className="leading-tight">
              <span>İşçi Giriş Duyurusu</span>
              <p className="text-[8px] text-slate-400 font-semibold">Kapı giriş durumunu duyurur</p>
            </div>
          </button>

          <button
            onClick={() => shareTemplate("izin")}
            className="w-full text-left p-2.5 rounded-xl border border-blue-100 bg-blue-50/50 hover:bg-blue-50 transition text-[10px] font-bold text-blue-900 flex items-center space-x-2 cursor-pointer"
          >
            <FileText size={13} className="text-blue-600 shrink-0" />
            <div className="leading-tight">
              <span>Personel Sevk &amp; İzin Duyurusu</span>
              <p className="text-[8px] text-slate-400 font-semibold">Kadro izinlerini duyurur</p>
            </div>
          </button>
        </div>

        <div className="border-t pt-4 space-y-3 flex-1 overflow-y-auto">
          <div className="flex items-center space-x-1.5">
            <Users size={14} className="text-slate-450" />
            <span className="font-bold text-slate-700 text-[10px] uppercase tracking-wider">Aktif Kullanıcılar</span>
          </div>

          <div className="space-y-2">
            {kullanicilar.slice(0, 10).map((u) => {
              const isOnline = true; // Simulated online status
              return (
                <div key={u.id} className="flex items-center justify-between p-1.5 hover:bg-slate-50 rounded-lg text-[10.5px]">
                  <div className="flex items-center space-x-2 min-w-0">
                    <div className="w-5 h-5 bg-blue-100 text-blue-700 font-bold rounded-full flex items-center justify-center text-[8.5px] uppercase shrink-0">
                      {u.ad ? u.ad[0] : u.email?.[0] || 'U'}
                    </div>
                    <div className="truncate leading-tight">
                      <span className="font-bold text-slate-800 block truncate">{u.ad ? `${u.ad} ${u.soyad}` : u.email?.split('@')[0]}</span>
                      <span className="text-[8px] text-slate-400 font-semibold">{u.yetki || "KULLANICI"}</span>
                    </div>
                  </div>
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full shrink-0" title="Aktif" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
