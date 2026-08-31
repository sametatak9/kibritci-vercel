import React, { useState, useEffect } from 'react';
import { 
  Plus, ClipboardList, CheckCircle2, Calendar, User, 
  AlertCircle, ArrowRight, Trash2, Edit3, HelpCircle 
} from 'lucide-react';
import { db, saveDocument } from '../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

interface Task {
  id: string;
  title: string;
  description: string;
  assignee: string;
  dueDate: string;
  priority: 'DÜŞÜK' | 'ORTA' | 'YÜKSEK' | 'ACİL';
  status: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
  notes?: string;
}

export const PlanliOrganizasyonScreen: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  
  // Form states
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [newDueDate, setNewDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [newPriority, setNewPriority] = useState<'DÜŞÜK' | 'ORTA' | 'YÜKSEK' | 'ACİL'>('ORTA');

  // Realtime tasks subscription
  useEffect(() => {
    const unsubTasks = onSnapshot(collection(db, 'asanaTasks'), (snapshot) => {
      const list: Task[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Task);
      });
      if (list.length === 0) {
        // Seed default tasks if empty
        const defaultTasks: Task[] = [
          {
            id: 'task_1',
            title: 'Kalıp Hazırlığı ve Demir Bağlama',
            description: 'A Blok 3. kat döşeme kalıplarının çakılması ve demir donatı bağlama işleri.',
            assignee: 'Ayhan Usta',
            dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            priority: 'YÜKSEK',
            status: 'IN_PROGRESS'
          },
          {
            id: 'task_2',
            title: 'Beton Dökümü Planlaması',
            description: 'Hazır beton firmasından C30 beton siparişi verilmesi ve pompa koordinasyonu.',
            assignee: 'Ahmet Şef',
            dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            priority: 'ACİL',
            status: 'TODO'
          },
          {
            id: 'task_3',
            title: 'Çevre Koruma Fileleri Montajı',
            description: 'Şantiye cephesine iş güvenliği kuralları gereği koruma filesi çekilmesi.',
            assignee: 'Hasan Formen',
            dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            priority: 'ORTA',
            status: 'TODO'
          },
          {
            id: 'task_4',
            title: 'Elektrik Sayaç Odası Sıva İşleri',
            description: 'Alt zemin kat elektrik sayaç odası kaba ve ince sıva işlerinin tamamlanması.',
            assignee: 'Salih Sıvacı',
            dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            priority: 'DÜŞÜK',
            status: 'DONE'
          }
        ];
        defaultTasks.forEach(t => saveDocument('asanaTasks', t));
      } else {
        setTasks(list);
      }
    }, (err) => {
      // offline fallback
      setTasks([
        {
          id: 'task_1',
          title: 'Kalıp Hazırlığı ve Demir Bağlama',
          description: 'A Blok 3. kat döşeme kalıplarının çakılması ve demir donatı bağlama işleri.',
          assignee: 'Ayhan Usta',
          dueDate: new Date().toISOString().split('T')[0],
          priority: 'YÜKSEK',
          status: 'IN_PROGRESS'
        }
      ]);
    });
    return () => unsubTasks();
  }, []);

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newAssignee.trim()) {
      alert("Lütfen en azından Görev Başlığı ve Görevli kısımlarını doldurunuz.");
      return;
    }

    const newTask: Task = {
      id: `task_${Date.now()}`,
      title: newTitle,
      description: newDesc,
      assignee: newAssignee,
      dueDate: newDueDate,
      priority: newPriority,
      status: 'TODO'
    };

    saveDocument('asanaTasks', newTask);
    setNewTitle("");
    setNewDesc("");
    setNewAssignee("");
    setNewDueDate(new Date().toISOString().split('T')[0]);
    setNewPriority('ORTA');
    setShowAddTaskModal(false);
  };

  const handleMoveTask = (task: Task, direction: 'forward' | 'backward') => {
    const statusOrder: Task['status'][] = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'];
    const currentIdx = statusOrder.indexOf(task.status);
    let nextIdx = currentIdx;

    if (direction === 'forward' && currentIdx < statusOrder.length - 1) {
      nextIdx = currentIdx + 1;
    } else if (direction === 'backward' && currentIdx > 0) {
      nextIdx = currentIdx - 1;
    }

    if (nextIdx !== currentIdx) {
      const updatedTask = { ...task, status: statusOrder[nextIdx] };
      saveDocument('asanaTasks', updatedTask);
    }
  };

  const handleDeleteTask = (id: string) => {
    if (window.confirm("Bu şantiye görevini silmek istediğinize emin misiniz?")) {
      const updatedTasks = tasks.filter(t => t.id !== id);
      // deleteDoc simulation
      tasks.forEach(async (t) => {
        if (t.id === id) {
          // Firebase delete is performed by saving a dummy or deleting in firestore if we had direct helper
          // For Applet Sandbox we can write list back or just use standard firestore deleteDoc if needed
          // Let's use direct firestore deleteDoc if db is active, else modify local array
          try {
            const { doc, deleteDoc } = await import('firebase/firestore');
            await deleteDoc(doc(db, 'asanaTasks', id));
          } catch {
            setTasks(updatedTasks);
          }
        }
      });
      alert("Görev silindi.");
    }
  };

  const getPriorityColor = (p: Task['priority']) => {
    switch (p) {
      case 'ACİL': return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'YÜKSEK': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'ORTA': return 'bg-slate-100 text-slate-800 border-slate-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const renderColumn = (colStatus: Task['status'], title: string, bgTheme: string, textTheme: string) => {
    const colTasks = tasks.filter(t => t.status === colStatus);
    return (
      <div className="flex-1 min-w-[280px] bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-col overflow-hidden max-h-[calc(100vh-190px)] shadow-xs">
        {/* Column Header */}
        <div className={`p-4 ${bgTheme} ${textTheme} flex items-center justify-between shrink-0`}>
          <div className="flex items-center space-x-2">
            <ClipboardList size={16} />
            <span className="font-bold text-xs uppercase tracking-wider">{title}</span>
          </div>
          <span className="bg-white/20 text-xs px-2 py-0.5 rounded-full font-bold">{colTasks.length}</span>
        </div>

        {/* Task Cards Container */}
        <div className="flex-grow overflow-y-auto p-3.5 space-y-3.5">
          {colTasks.length === 0 ? (
            <div className="h-20 border border-dashed border-slate-200 rounded-xl flex items-center justify-center text-[10px] text-slate-400 font-medium italic">
              Görev bulunmuyor.
            </div>
          ) : (
            colTasks.map(t => (
              <div 
                key={t.id} 
                className="bg-white border border-slate-200/70 hover:border-slate-350 rounded-xl p-3.5 shadow-sm hover:shadow transition flex flex-col space-y-3 text-xs"
              >
                <div className="flex justify-between items-start">
                  <span className={`px-2 py-0.5 border text-[9px] font-black rounded-md ${getPriorityColor(t.priority)}`}>
                    {t.priority}
                  </span>
                  <button 
                    onClick={() => handleDeleteTask(t.id)}
                    className="text-slate-400 hover:text-rose-600 transition"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                <div className="space-y-1">
                  <h5 className="font-bold text-slate-900 leading-snug">{t.title}</h5>
                  <p className="text-[11px] text-slate-500 leading-relaxed">{t.description}</p>
                </div>

                <div className="border-t border-slate-100 pt-2.5 flex items-center justify-between text-[10px] text-slate-450 font-medium">
                  <div className="flex items-center space-x-1">
                    <User size={12} className="text-slate-400" />
                    <span className="font-semibold text-slate-700">{t.assignee}</span>
                  </div>
                  <div className="flex items-center space-x-1 font-mono">
                    <Calendar size={11} className="text-slate-400" />
                    <span className={new Date(t.dueDate) < new Date() && t.status !== 'DONE' ? 'text-rose-600 font-bold' : ''}>
                      {t.dueDate}
                    </span>
                  </div>
                </div>

                {/* Shifting buttons */}
                <div className="flex justify-end gap-1.5 pt-1.5 border-t border-slate-50">
                  {t.status !== 'TODO' && (
                    <button 
                      onClick={() => handleMoveTask(t, 'backward')}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 py-1 px-2 rounded-lg font-bold text-[9px] transition cursor-pointer"
                    >
                      ◀ Geri
                    </button>
                  )}
                  {t.status !== 'DONE' && (
                    <button 
                      onClick={() => handleMoveTask(t, 'forward')}
                      className="bg-slate-900 hover:bg-slate-900 text-white py-1 px-2 rounded-lg font-bold text-[9px] transition cursor-pointer"
                    >
                      İleri ▶
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-grow p-6 min-h-[calc(100vh-52px)] overflow-y-auto flex flex-col font-sans select-none bg-slate-50/50">
      
      {/* Top Banner Indicator */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between shadow-xs gap-4 shrink-0">
        <div className="space-y-1">
          <span className="text-[10px] font-black tracking-widest text-[#2563eb] uppercase">Şantiyesel İş Listesi (Asana Kanban)</span>
          <h2 className="font-display font-bold text-sm text-slate-900 flex items-center gap-1.5">
            📅 Planlı Şantiye Organizasyonu &amp; Süreç Takip Panosu
          </h2>
        </div>
        <button
          onClick={() => setShowAddTaskModal(true)}
          className="bg-slate-900 hover:bg-slate-900 text-white font-bold text-xs py-2 px-4 rounded-xl shadow-md transition duration-150 flex items-center gap-1.5 cursor-pointer active:scale-95"
        >
          <Plus size={15} />
          Yeni Görev Ekle
        </button>
      </div>

      {/* Board Columns container */}
      <div className="flex-grow flex gap-4 overflow-x-auto pb-4">
        {renderColumn('TODO', 'Yapılacaklar', 'bg-slate-700', 'text-white')}
        {renderColumn('IN_PROGRESS', 'Çalışılıyor', 'bg-slate-900', 'text-white')}
        {renderColumn('REVIEW', 'Kontrol & Onay', 'bg-amber-500', 'text-slate-950')}
        {renderColumn('DONE', 'Tamamlandı', 'bg-emerald-600', 'text-white')}
      </div>

      {/* ➕ ADD TASK MODAL OVERLAY */}
      {showAddTaskModal && (
        <div className="fixed inset-0 bg-slate-950/70 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-100 flex flex-col">
            <div className="bg-slate-900 border-b p-4 text-white flex justify-between items-center">
              <h3 className="font-display font-bold text-sm flex items-center gap-1.5">
                📅 Yeni Şantiye Görevi Tanımla
              </h3>
              <button 
                onClick={() => setShowAddTaskModal(false)}
                className="text-slate-400 hover:text-white font-bold cursor-pointer text-xs"
              >
                ✖
              </button>
            </div>

            <form onSubmit={handleAddTask} className="p-5 space-y-4 text-xs">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Görev Başlığı *</label>
                <input 
                  type="text"
                  required
                  placeholder="Yapılacak iş..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">İş Açıklaması / Detay</label>
                <textarea 
                  rows={3}
                  placeholder="İşin detayları, lokasyon vb..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full text-xs mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Görevli Sorumlu *</label>
                  <input 
                    type="text"
                    required
                    placeholder="Örn: Ayhan Usta"
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value)}
                    className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Termin Tarihi *</label>
                  <input 
                    type="date"
                    required
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Öncelik Derecesi</label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as any)}
                  className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                >
                  <option value="DÜŞÜK">Düşük</option>
                  <option value="ORTA">Orta</option>
                  <option value="YÜKSEK">Yüksek</option>
                  <option value="ACİL">Acil / Kritik</option>
                </select>
              </div>

              <div className="pt-3 border-t flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddTaskModal(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-xl text-center transition cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-slate-900 hover:bg-slate-900 text-white font-bold py-2 rounded-xl text-center shadow transition cursor-pointer"
                >
                  Görevi Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default PlanliOrganizasyonScreen;
