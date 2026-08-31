import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen, Calendar, FileUp, Grid3X3, Images, Loader2, Pencil, Printer,
  Trash2, X, Check, Layers, Eye, AlertCircle, Plus, Camera, Search, Filter, FileDown, CheckCircle2, ChevronRight, MessageSquare, History, ZoomIn
} from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db, removeDocument, saveDocument } from '../lib/firebase';
import { compressImage } from '../lib/imageCompress';
import { SahaKolajFoto, SahaFaaliyeti, ProgramliFaaliyet } from '../types/erp';
import {
  AY_ADLARI,
  albumBaslik,
  albumKeyFrom,
  buildMagazinePages,
  groupKolajFotolari,
  readFileAsDataUrl,
} from '../lib/sahaKolajUtils';
import { PARSEL_BLOK_MAP, PARSEL_LIST, defaultBlokForParsel } from '../data/parselBlokMap';
import { KIBRITCI_LOGO_PATH } from '../lib/kibritciBrand';


interface SahaKolajScreenProps {
  currentUser?: { email?: string; displayName?: string };
  sahaFaaliyetleri?: SahaFaaliyeti[];
  programliFaaliyetler?: ProgramliFaaliyet[];
}

export const SahaKolajScreen: React.FC<SahaKolajScreenProps> = ({ 
  currentUser,
  sahaFaaliyetleri = [],
  programliFaaliyetler = [],
}) => {
  const now = new Date();
  const [yil, setYil] = useState(now.getFullYear());
  const [ay, setAy] = useState(now.getMonth() + 1);
  const albumKey = albumKeyFrom(yil, ay);

  const [fotolar, setFotolar] = useState<SahaKolajFoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editId, setEditId] = useState<string | null>(null);
  const [editBaslik, setEditBaslik] = useState('');
  const [editAciklama, setEditAciklama] = useState('');
  const [editGrup, setEditGrup] = useState('');
  const [bulkGrup, setBulkGrup] = useState('');
  const [uploadParsel, setUploadParsel] = useState('Parsel Bölge 157/46');
  const [uploadBlok, setUploadBlok] = useState(defaultBlokForParsel('Parsel Bölge 157/46'));
  const [editParsel, setEditParsel] = useState('');
  const [editBlok, setEditBlok] = useState('');

  const [viewMode, setViewMode] = useState<'grid' | 'dergi' | 'kolaj'>('grid');
  const [showPreview, setShowPreview] = useState(false);
  const [filterGrup, setFilterGrup] = useState<string>('');
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  
  // Resim büyütme state
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'sahaKolajFotolari'), where('albumKey', '==', albumKey));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: SahaKolajFoto[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() } as SahaKolajFoto));
        list.sort((a, b) => a.sira - b.sira);
        setFotolar(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [albumKey]);

  useEffect(() => {
    setSelectedIds(new Set());
    setEditId(null);
    setFilterGrup('');
  }, [albumKey]);

  const allFotolar = useMemo(() => {
    const list: SahaKolajFoto[] = [...fotolar];
    let siraOffset = fotolar.length > 0 ? Math.max(...fotolar.map((f) => f.sira || 0)) + 1 : 1;

    // Gunluk Saha Faaliyetlerinden (Formen vb.) gelen fotolar
    sahaFaaliyetleri.forEach((sf) => {
      if (!sf.tarih || !sf.tarih.startsWith(albumKey)) return;
      const urls = sf.fotoUrls || (sf.fotoUrl ? [sf.fotoUrl] : []);
      urls.forEach((url, i) => {
        if (!url) return;
        const id = `sf_${sf.id}_${i}`;
        if (list.some(x => x.id === id)) return;
        list.push({
          id,
          albumKey,
          yil,
          ay,
          imageUrl: url,
          baslik: sf.isinAdi || sf.isNiteligi || 'Günlük Faaliyet',
          aciklama: sf.aciklama,
          grupAdi: `Parsel: ${sf.parsel} - Blok: ${sf.blok}`,
          sira: siraOffset++,
          yuklemeTarihi: sf.tarih,
          yukleyen: sf.kaydeden || 'Formen',
          parsel: sf.parsel,
          blok: sf.blok,
          isReadonly: true, // we cannot edit/delete these via Saha Kolaj
        } as any);
      });
    });

    // Programli Faaliyetlerden gelen fotolar
    programliFaaliyetler.forEach((pf) => {
      if (!pf.tarih || !pf.tarih.startsWith(albumKey)) return;
      pf.asamalar?.forEach((asama, i) => {
        if (!asama.tamamlandi || !asama.fotoUrl) return;
        const id = `pf_${pf.id}_${asama.adim}`;
        if (list.some(x => x.id === id)) return;
        list.push({
          id,
          albumKey,
          yil,
          ay,
          imageUrl: asama.fotoUrl,
          baslik: `${pf.isinAdi} (${asama.adim})`,
          aciklama: asama.aciklama,
          grupAdi: `Parsel: ${pf.parsel} - Blok: ${pf.bloklar}`,
          sira: siraOffset++,
          yuklemeTarihi: asama.tamamlanmaTarihi || pf.tarih,
          yukleyen: pf.olusturan || 'Formen',
          parsel: pf.parsel,
          blok: pf.bloklar,
          isReadonly: true,
        } as any);
      });
    });

    return list.sort((a, b) => a.sira - b.sira || a.yuklemeTarihi.localeCompare(b.yuklemeTarihi));
  }, [fotolar, sahaFaaliyetleri, programliFaaliyetler, albumKey, yil, ay]);

  const gruplar = useMemo(() => {
    const set = new Set<string>();
    allFotolar.forEach((f) => {
      const g = (f.grupAdi || '').trim();
      if (g) set.add(g);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
  }, [allFotolar]);

  const filteredFotolar = useMemo(() => {
    if (!filterGrup) return allFotolar;
    return allFotolar.filter((f) => (f.grupAdi || '').trim() === filterGrup);
  }, [allFotolar, filterGrup]);

  const magazinePages = useMemo(
    () => buildMagazinePages(allFotolar, yil, ay),
    [allFotolar, yil, ay]
  );

  const kolajGruplar = useMemo(() => groupKolajFotolari(allFotolar), [allFotolar]);

  const openEdit = (f: SahaKolajFoto & { isReadonly?: boolean }) => {
    setEditId(f.id);
    setEditBaslik(f.baslik || '');
    setEditAciklama(f.aciklama || '');
    setEditGrup(f.grupAdi || '');
    setEditParsel(f.parsel || 'Parsel Bölge 157/46');
    setEditBlok(f.blok || defaultBlokForParsel(f.parsel || 'Parsel Bölge 157/46'));
  };

  const handleSaveEdit = async () => {
    if (!editId) return;
    
    let f = fotolar.find((x) => x.id === editId);
    if (!f) {
      const original = allFotolar.find(x => x.id === editId);
      if (!original) return;
      f = { ...original };
    }

    const updated: SahaKolajFoto = {
      ...f,
      baslik: editBaslik.trim(),
      aciklama: editAciklama.trim(),
      grupAdi: editGrup.trim(),
      parsel: editParsel,
      blok: editBlok,
      isReadonly: false,
    };

    if (fotolar.some(x => x.id === editId)) {
      setFotolar((prev) => prev.map((x) => (x.id === editId ? updated : x)));
    } else {
      setFotolar((prev) => [...prev, updated]);
    }

    await saveDocument('sahaKolajFotolari', updated);
    setEditId(null);
  };

  const handleBulkGrup = async () => {
    if (!bulkGrup.trim() || selectedIds.size === 0) return;
    const grup = bulkGrup.trim();
    await Promise.all(
      fotolar
        .filter((f) => selectedIds.has(f.id))
        .map((f) => saveDocument('sahaKolajFotolari', { ...f, grupAdi: grup }))
    );
    setBulkGrup('');
    setSelectedIds(new Set());
  };

  const handleUploadFiles = async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      alert('Lütfen yalnızca görsel dosyası seçin (JPG, PNG, WEBP).');
      return;
    }

    setUploading(true);
    setUploadProgress({ done: 0, total: imageFiles.length });
    let sira = fotolar.length;

    try {
      for (const file of imageFiles) {
        const raw = await readFileAsDataUrl(file);
        const compressed = await compressImage(raw, 1024, 1024, 0.72);
        const id = `skf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const foto: SahaKolajFoto = {
          id,
          albumKey,
          yil,
          ay,
          imageUrl: compressed,
          sira: sira++,
          dosyaAdi: file.name,
          yuklemeTarihi: new Date().toISOString(),
          yukleyen: currentUser?.email,
          parsel: uploadParsel,
          blok: uploadBlok,
        };
        await saveDocument('sahaKolajFotolari', foto);
        setUploadProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    } catch (err) {
      console.error(err);
      alert('Yükleme sırasında hata oluştu. Bağlantınızı kontrol edin.');
    } finally {
      setUploading(false);
      setUploadProgress({ done: 0, total: 0 });
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Bu fotoğraf silinsin mi?')) return;
    await removeDocument('sahaKolajFotolari', id);
    if (editId === id) setEditId(null);
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`${selectedIds.size} fotoğraf silinsin mi?`)) return;
    await Promise.all([...selectedIds].map((id) => removeDocument('sahaKolajFotolari', id)));
    setSelectedIds(new Set());
  };

  const handleDeleteAlbum = async () => {
    if (fotolar.length === 0) return;
    if (
      !window.confirm(
        `${albumBaslik(yil, ay)} albümündeki ${fotolar.length} fotoğrafın tamamı kalıcı silinecek. Devam?`
      )
    ) {
      return;
    }
    await Promise.all(fotolar.map((f) => removeDocument('sahaKolajFotolari', f.id)));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const getImageSize = (src: string) =>
    new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width || 1200, height: img.height || 800 });
      img.onerror = reject;
      img.src = src;
    });

  const getBase64Image = (src: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject();
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = reject;
      img.src = src;
    });
  };

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF('p', 'mm', 'a4');
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      
      const logoUrl = `${window.location.origin}${KIBRITCI_LOGO_PATH}`;
      let logoData = '';
      let logoW = 0; let logoH = 0;
      try {
        logoData = await getBase64Image(logoUrl);
        const s = await getImageSize(logoUrl);
        logoW = s.width; logoH = s.height;
      } catch (e) {
        console.warn('Logo yuklenemedi');
      }

      const drawWatermark = () => {
        if (!logoData) return;
        const GState = (jsPDF as any).GState || (doc as any).GState;
        if (GState) {
           doc.setGState(new GState({ opacity: 0.05 }));
        }
        const lw = 150;
        const lh = (logoH / logoW) * lw;
        doc.addImage(logoData, 'JPEG', (pw - lw) / 2, (ph - lh) / 2, lw, lh);
        if (GState) {
           doc.setGState(new GState({ opacity: 1 }));
        }
      };

      for (let i = 0; i < magazinePages.length; i++) {
        if (i > 0) doc.addPage();
        const page = magazinePages[i];
        
        drawWatermark();

        if (page.type === 'cover') {
           doc.setFontSize(28);
           doc.setFont('helvetica', 'bold');
           doc.setTextColor(15, 23, 42);
           doc.text((page.title || '').replace(/i/g, 'i').replace(/I/g, 'I').toUpperCase(), pw/2, ph/2 - 10, { align: 'center' });
           
           doc.setFontSize(14);
           doc.setFont('helvetica', 'normal');
           doc.setTextColor(100, 116, 139);
           doc.text((page.subtitle || '').replace(/i/g, 'i').replace(/I/g, 'I'), pw/2, ph/2 + 10, { align: 'center' });

           if (logoData) {
             const lw = 60;
             const lh = (logoH / logoW) * lw;
             doc.addImage(logoData, 'JPEG', (pw - lw) / 2, ph/2 - 80, lw, lh);
           }
        }
        else if (page.type === 'toc') {
           doc.setFontSize(24);
           doc.setFont('helvetica', 'bold');
           doc.setTextColor(245, 158, 11);
           doc.text('ICINDEKILER', 20, 30);
           
           doc.setLineWidth(1);
           doc.setDrawColor(245, 158, 11);
           doc.line(20, 35, pw - 20, 35);

           doc.setFontSize(12);
           doc.setTextColor(15, 23, 42);
           let y = 50;
           (page.groups || []).forEach((g, idx) => {
             // Simple sanitize for jsPDF helvetica
             const cleanAd = g.ad.replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
                                 .replace(/ü/g, 'u').replace(/Ü/g, 'U')
                                 .replace(/ş/g, 's').replace(/Ş/g, 'S')
                                 .replace(/ı/g, 'i').replace(/İ/g, 'I')
                                 .replace(/ö/g, 'o').replace(/Ö/g, 'O')
                                 .replace(/ç/g, 'c').replace(/Ç/g, 'C');
             doc.text(`${idx + 1}. ${cleanAd}`, 20, y);
             doc.text(`${g.count} fotograf`, pw - 20, y, { align: 'right' });
             y += 10;
           });
        }
        else if (page.type === 'section') {
           doc.setFontSize(30);
           doc.setFont('helvetica', 'bold');
           doc.setTextColor(15, 23, 42);
           const cleanTitle = (page.title || '').replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
                               .replace(/ü/g, 'u').replace(/Ü/g, 'U')
                               .replace(/ş/g, 's').replace(/Ş/g, 'S')
                               .replace(/ı/g, 'i').replace(/İ/g, 'I')
                               .replace(/ö/g, 'o').replace(/Ö/g, 'O')
                               .replace(/ç/g, 'c').replace(/Ç/g, 'C');
           doc.text(cleanTitle, pw/2, ph/2, { align: 'center' });
           
           doc.setFontSize(14);
           doc.setFont('helvetica', 'normal');
           doc.setTextColor(100, 116, 139);
           const cleanSub = (page.subtitle || '').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c');
           doc.text(cleanSub, pw/2, ph/2 + 15, { align: 'center' });
        }
        else if (page.type === 'spread') {
           if (page.title && page.title !== 'Genel Saha Faaliyetleri') {
             doc.setFontSize(12);
             doc.setFont('helvetica', 'bold');
             doc.setTextColor(245, 158, 11);
             const cleanTitle = page.title.replace(/ğ/g, 'g').replace(/Ğ/g, 'G').replace(/ü/g, 'u').replace(/Ü/g, 'U').replace(/ş/g, 's').replace(/Ş/g, 'S').replace(/ı/g, 'i').replace(/İ/g, 'I').replace(/ö/g, 'o').replace(/Ö/g, 'O').replace(/ç/g, 'c').replace(/Ç/g, 'C');
             doc.text(cleanTitle, pw/2, 20, { align: 'center' });
           }
           
           const numPhotos = page.photos?.length || 0;
           const isSingle = numPhotos === 1;
           const margin = 15;
           const spacing = 10;
           const w = isSingle ? (pw - margin * 4) : (pw - margin * 2 - spacing) / 2;
           const h = w * 0.75; // 4/3 aspect ratio
           
           let col = 0;
           let row = 0;
           const startY = 30;
           
           for (const f of (page.photos || [])) {
             const x = isSingle ? (pw - w) / 2 : margin + col * (w + spacing);
             const y = startY + row * (h + 45); // 45 for text
             
             try {
               const imgBase = await getBase64Image(f.imageUrl);
               doc.addImage(imgBase, 'JPEG', x, y, w, h);
             } catch (e) {
               console.warn('Foto yuklenemedi', f.imageUrl);
               doc.setDrawColor(200);
               doc.rect(x, y, w, h);
               doc.text('Gorsel Yuklenemedi', x + w/2, y + h/2, { align: 'center' });
             }
             
             doc.setFontSize(11);
             doc.setFont('helvetica', 'bold');
             doc.setTextColor(15, 23, 42);
             const baslik = (f.baslik || 'Faaliyet').replace(/ğ/g, 'g').replace(/Ğ/g, 'G').replace(/ü/g, 'u').replace(/Ü/g, 'U').replace(/ş/g, 's').replace(/Ş/g, 'S').replace(/ı/g, 'i').replace(/İ/g, 'I').replace(/ö/g, 'o').replace(/Ö/g, 'O').replace(/ç/g, 'c').replace(/Ç/g, 'C');
             doc.text(baslik, x, y + h + 6);
             
             if (f.aciklama) {
                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(100, 116, 139);
                const aciklama = f.aciklama.replace(/ğ/g, 'g').replace(/Ğ/g, 'G').replace(/ü/g, 'u').replace(/Ü/g, 'U').replace(/ş/g, 's').replace(/Ş/g, 'S').replace(/ı/g, 'i').replace(/İ/g, 'I').replace(/ö/g, 'o').replace(/Ö/g, 'O').replace(/ç/g, 'c').replace(/Ç/g, 'C');
                const lines = doc.splitTextToSize(aciklama, w);
                doc.text(lines, x, y + h + 12);
             }

             if (f.grupAdi) {
                doc.setFontSize(8);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(245, 158, 11);
                const grup = f.grupAdi.substring(0, 50).replace(/ğ/g, 'g').replace(/Ğ/g, 'G').replace(/ü/g, 'u').replace(/Ü/g, 'U').replace(/ş/g, 's').replace(/Ş/g, 'S').replace(/ı/g, 'i').replace(/İ/g, 'I').replace(/ö/g, 'o').replace(/Ö/g, 'O').replace(/ç/g, 'c').replace(/Ç/g, 'C');
                doc.text(grup, x, y + h + 35);
             }

             col++;
             if (col > 1) {
               col = 0;
               row++;
             }
           }
        }
        else if (page.type === 'collage') {
           doc.setFontSize(20);
           doc.setFont('helvetica', 'bold');
           doc.setTextColor(15, 23, 42);
           doc.text('KOLAJ', 15, 20);
           
           const cols = 5;
           const margin = 15;
           const spacing = 3;
           const w = (pw - margin*2 - spacing*(cols-1)) / cols;
           const h = w;
           
           let col = 0;
           let row = 0;
           let startY = 30;
           
           for (const f of (page.photos || [])) {
             let currentY = startY + row * (h + spacing);
             
             if (currentY + h > ph - margin) {
               doc.addPage();
               drawWatermark();
               col = 0; row = 0; startY = 20;
               currentY = startY;
             }
             const currentX = margin + col * (w + spacing);
             
             try {
               const imgBase = await getBase64Image(f.imageUrl);
               doc.addImage(imgBase, 'JPEG', currentX, currentY, w, h);
             } catch (e) {}
             
             col++;
             if (col >= cols) {
               col = 0;
               row++;
             }
           }
        }
        else if (page.type === 'summary') {
           doc.setFontSize(24);
           doc.setFont('helvetica', 'bold');
           doc.setTextColor(245, 158, 11);
           const cleanTitle = (page.title || '').replace(/ğ/g, 'g').replace(/Ğ/g, 'G').replace(/ü/g, 'u').replace(/Ü/g, 'U').replace(/ş/g, 's').replace(/Ş/g, 'S').replace(/ı/g, 'i').replace(/İ/g, 'I').replace(/ö/g, 'o').replace(/Ö/g, 'O').replace(/ç/g, 'c').replace(/Ç/g, 'C');
           doc.text(cleanTitle, pw/2, 30, { align: 'center' });
           
           doc.setLineWidth(1);
           doc.setDrawColor(245, 158, 11);
           doc.line(20, 35, pw - 20, 35);

           doc.setFontSize(12);
           let y = 50;
           (page.summaryData || []).forEach((g, idx) => {
             if (y > ph - 30) {
               doc.addPage();
               drawWatermark();
               y = 30;
             }
             doc.setFont('helvetica', 'bold');
             doc.setTextColor(15, 23, 42);
             const cleanAd = g.parsel.replace(/ğ/g, 'g').replace(/Ğ/g, 'G').replace(/ü/g, 'u').replace(/Ü/g, 'U').replace(/ş/g, 's').replace(/Ş/g, 'S').replace(/ı/g, 'i').replace(/İ/g, 'I').replace(/ö/g, 'o').replace(/Ö/g, 'O').replace(/ç/g, 'c').replace(/Ç/g, 'C');
             doc.text(`${idx + 1}. Parsel: ${cleanAd}`, 20, y);
             doc.text(`${g.count} fotograf`, pw - 20, y, { align: 'right' });
             
             y += 6;
             doc.setFont('helvetica', 'normal');
             doc.setFontSize(9);
             doc.setTextColor(100, 116, 139);
             const bloksText = g.bloks.join(', ').replace(/ğ/g, 'g').replace(/Ğ/g, 'G').replace(/ü/g, 'u').replace(/Ü/g, 'U').replace(/ş/g, 's').replace(/Ş/g, 'S').replace(/ı/g, 'i').replace(/İ/g, 'I').replace(/ö/g, 'o').replace(/Ö/g, 'O').replace(/ç/g, 'c').replace(/Ç/g, 'C');
             const lines = doc.splitTextToSize(`Bloklar: ${bloksText}`, pw - 40);
             doc.text(lines, 25, y);
             y += lines.length * 5 + 4;
           });
        }
      }

      doc.save(`Saha_Faaliyet_Raporu_${albumBaslik(yil, ay)}.pdf`);
    } catch (error) {
      console.error(error);
      alert('PDF oluşturulurken bir hata oluştu.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const yilSecenekleri = [2025, 2026, 2027];

  return (
    <div className="flex-1 flex flex-col gap-4 overflow-hidden min-h-0">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #saha-kolaj-print, #saha-kolaj-print * { visibility: visible; }
          #saha-kolaj-print { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          .magazine-page { page-break-after: always; break-after: page; }
        }
        .magazine-page {
          min-height: 100vh;
          box-sizing: border-box;
        }
      `}</style>

      {/* Header */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-100 rounded-xl">
            <Images className="text-amber-700" size={22} />
          </div>
          <div>
            <h2 className="font-bold text-slate-800 text-sm">Saha Faaliyeti Kolaj Hazırla</h2>
            <p className="text-[11px] text-slate-500">
              Ay bazlı toplu fotoğraf yükle → başlık/grupla → dergi veya kolaj olarak yönetime sun
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => { setShowPreview(true); setViewMode('dergi'); }}
            disabled={fotolar.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-900 disabled:opacity-40 text-white text-xs font-bold rounded-xl"
          >
            <BookOpen size={14} />
            Dergi Önizle
          </button>
          <button
            type="button"
            onClick={() => { setShowPreview(true); setViewMode('kolaj'); }}
            disabled={fotolar.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-xs font-bold rounded-xl"
          >
            <Grid3X3 size={14} />
            Kolaj Önizle
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={fotolar.length === 0 || downloadingPdf}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white text-xs font-bold rounded-xl"
          >
            {downloadingPdf ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
            {downloadingPdf ? 'İndiriliyor...' : 'PDF İndir'}
          </button>
        </div>
      </div>

      <div className="no-print flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
        {/* Sol: Ay seç & yükle */}
        <div className="w-full lg:w-[300px] lg:shrink-0 bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden shadow-sm min-h-0">
          <div className="bg-amber-600 text-white p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-100">Albüm Seçimi</span>
            <h3 className="font-bold text-sm flex items-center gap-2 mt-1">
              <Calendar size={16} />
              {albumBaslik(yil, ay)}
            </h3>
          </div>

          <div className="p-4 space-y-4 text-xs flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] font-bold text-slate-500 uppercase">Yıl</label>
                <select
                  value={yil}
                  onChange={(e) => setYil(Number(e.target.value))}
                  className="w-full mt-1 p-2 border rounded-lg font-bold"
                >
                  {yilSecenekleri.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-500 uppercase">Ay</label>
                <select
                  value={ay}
                  onChange={(e) => setAy(Number(e.target.value))}
                  className="w-full mt-1 p-2 border rounded-lg font-bold"
                >
                  {AY_ADLARI.map((ad, i) => (
                    <option key={ad} value={i + 1}>{ad}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 border border-slate-200 rounded-xl p-3 bg-slate-50">
              <span className="text-[9px] font-bold text-slate-500 uppercase">Parsel / Blok (Analiz için)</span>
              <select
                value={uploadParsel}
                onChange={(e) => {
                  setUploadParsel(e.target.value);
                  setUploadBlok(defaultBlokForParsel(e.target.value));
                }}
                className="w-full p-2 border rounded-lg text-xs"
              >
                {PARSEL_LIST.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <select value={uploadBlok} onChange={(e) => setUploadBlok(e.target.value)} className="w-full p-2 border rounded-lg text-xs">
                {(PARSEL_BLOK_MAP[uploadParsel] || ['GENEL SAHA']).map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            <div className="border-2 border-dashed border-amber-200 rounded-xl p-4 bg-amber-50/50 text-center space-y-2">
              <FileUp className="mx-auto text-amber-600" size={28} />
              <p className="font-bold text-slate-700">Toplu Fotoğraf Yükle</p>
              <p className="text-[10px] text-slate-500">100+ fotoğraf seçebilirsiniz. Sıkıştırılarak kaydedilir.</p>
              <label className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2 rounded-lg cursor-pointer">
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
                <span>{uploading ? 'Yükleniyor…' : 'Dosya Seç'}</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => e.target.files && handleUploadFiles(e.target.files)}
                />
              </label>
              {uploading && uploadProgress.total > 0 && (
                <div className="space-y-1">
                  <div className="h-2 bg-amber-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-600 transition-all"
                      style={{ width: `${(uploadProgress.done / uploadProgress.total) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-amber-800 font-bold">
                    {uploadProgress.done} / {uploadProgress.total}
                  </span>
                </div>
              )}
            </div>

            <div className="bg-slate-50 rounded-xl p-3 space-y-1 border">
              <div className="flex justify-between">
                <span className="text-slate-500">Fotoğraf</span>
                <strong>{fotolar.length}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Grup</span>
                <strong>{gruplar.length || '—'}</strong>
              </div>
            </div>

            {gruplar.length > 0 && (
              <div>
                <label className="text-[9px] font-bold text-slate-500 uppercase">Gruba Göre Filtre</label>
                <select
                  value={filterGrup}
                  onChange={(e) => setFilterGrup(e.target.value)}
                  className="w-full mt-1 p-2 border rounded-lg"
                >
                  <option value="">Tümü</option>
                  {gruplar.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
            )}

            {selectedIds.size > 0 && (
              <div className="border border-slate-200 bg-slate-50 rounded-xl p-3 space-y-2">
                <span className="font-bold text-slate-800">{selectedIds.size} seçili</span>
                <input
                  type="text"
                  placeholder="Grup adı (ör: A Blok Beton)"
                  value={bulkGrup}
                  onChange={(e) => setBulkGrup(e.target.value)}
                  className="w-full p-2 border rounded-lg text-xs"
                />
                <button
                  type="button"
                  onClick={handleBulkGrup}
                  className="w-full bg-slate-900 text-white font-bold py-1.5 rounded-lg"
                >
                  Seçililere Grup Ata
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  className="w-full bg-rose-100 text-rose-700 font-bold py-1.5 rounded-lg"
                >
                  Seçilileri Sil
                </button>
              </div>
            )}

            {fotolar.length > 0 && (
              <button
                type="button"
                onClick={handleDeleteAlbum}
                className="w-full text-rose-600 border border-rose-200 hover:bg-rose-50 font-bold py-2 rounded-lg text-[10px]"
              >
                Bu Ayın Albümünü Tamamen Sil
              </button>
            )}
          </div>
        </div>

        {/* Orta: Foto grid */}
        <div className="flex-1 min-w-0 bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden shadow-sm">
          <div className="p-3 border-b flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
              <Layers size={14} />
              Fotoğraf Havuzu
            </span>
            {loading && <Loader2 size={14} className="animate-spin text-slate-400" />}
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {!loading && filteredFotolar.length === 0 && (
              <div className="text-center py-20 text-slate-400 space-y-2">
                <Images size={40} className="mx-auto opacity-30" />
                <p className="font-bold text-sm">Bu ay için henüz fotoğraf yok</p>
                <p className="text-xs">Sol panelden ay seçip toplu yükleme yapın</p>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {filteredFotolar.map((f) => {
                const selected = selectedIds.has(f.id);
                const editing = editId === f.id;
                return (
                  <div
                    key={f.id}
                    className={`relative group rounded-xl overflow-hidden border-2 transition ${
                      selected ? 'border-slate-800 ring-2 ring-slate-800' : editing ? 'border-amber-500' : 'border-slate-100'
                    } ${(f as any).isReadonly ? 'opacity-90' : ''}`}
                  >
                    {!(f as any).isReadonly && (
                      <button
                        type="button"
                        onClick={() => toggleSelect(f.id)}
                        className={`absolute top-1 left-1 z-10 w-5 h-5 rounded border flex items-center justify-center ${
                          selected ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white/90 border-slate-300'
                        }`}
                      >
                        {selected && <Check size={12} />}
                      </button>
                    )}
                    <img
                      src={f.imageUrl}
                      alt={f.baslik || f.dosyaAdi || 'saha'}
                      className={`w-full aspect-square object-cover cursor-pointer`}
                      onClick={() => setExpandedImage(f.imageUrl)}
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition">
                      <p className="text-[9px] text-white font-bold truncate">
                        {(f as any).isReadonly && <span className="mr-1 text-amber-300 font-normal">[Oto]</span>}
                        {f.baslik || f.dosyaAdi || 'Başlıksız'}
                      </p>
                      {f.grupAdi && (
                        <p className="text-[8px] text-amber-200 truncate">{f.grupAdi}</p>
                      )}
                    </div>
                    <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setExpandedImage(f.imageUrl); }}
                        className="p-1 bg-white/90 rounded text-slate-700 hover:text-blue-600"
                        title="Büyüt"
                      >
                        <ZoomIn size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openEdit(f); }}
                        className="p-1 bg-white/90 rounded text-slate-700 hover:text-amber-600"
                        title="Düzenle"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDelete(f.id); }}
                        className="p-1 bg-white/90 rounded text-rose-600 hover:bg-rose-50"
                        title="Sil"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sağ: Metadata edit */}
        <div className="w-full lg:w-[280px] lg:shrink-0 bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden shadow-sm min-h-0">
          <div className="p-4 border-b bg-slate-50">
            <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider">Foto Bilgisi</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Dergide görünecek başlık ve açıklama</p>
          </div>
          {editId ? (
            <div className="p-4 space-y-3 text-xs flex-1 overflow-y-auto">
              {(() => {
                const f = allFotolar.find((x) => x.id === editId);
                if (!f) return null;
                return (
                  <>
                    <img src={f.imageUrl} alt="" className="w-full rounded-lg border" />
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Başlık</label>
                      <input
                        value={editBaslik}
                        onChange={(e) => setEditBaslik(e.target.value)}
                        placeholder="Örn: C30 Perde Betonu"
                        className="w-full mt-1 p-2 border rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Parsel</label>
                      <select value={editParsel} onChange={(e) => { setEditParsel(e.target.value); setEditBlok(defaultBlokForParsel(e.target.value)); }} className="w-full mt-1 p-2 border rounded-lg">
                        {PARSEL_LIST.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Blok</label>
                      <select value={editBlok} onChange={(e) => setEditBlok(e.target.value)} className="w-full mt-1 p-2 border rounded-lg">
                        {(PARSEL_BLOK_MAP[editParsel] || ['GENEL SAHA']).map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Grup / Bölüm</label>
                      <input
                        value={editGrup}
                        onChange={(e) => setEditGrup(e.target.value)}
                        placeholder="Örn: A Blok İmalat"
                        list="kolaj-grup-list"
                        className="w-full mt-1 p-2 border rounded-lg"
                      />
                      <datalist id="kolaj-grup-list">
                        {gruplar.map((g) => (
                          <option key={g} value={g} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Açıklama</label>
                      <textarea
                        value={editAciklama}
                        onChange={(e) => setEditAciklama(e.target.value)}
                        rows={4}
                        placeholder="Dergi sayfasında görünecek kısa tanım…"
                        className="w-full mt-1 p-2 border rounded-lg resize-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-xl"
                    >
                      Kaydet
                    </button>
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-6 text-center text-slate-400 text-xs">
              Düzenlemek için bir fotoğrafa tıklayın. Grup adı vererek dergide bölüm oluşturabilirsiniz.
            </div>
          )}
        </div>
      </div>

      {/* Print / hidden magazine layout */}
      <div id="saha-kolaj-print" ref={printRef} className="hidden print:block">
        {magazinePages.map((page, idx) => (
          <div key={idx} className="magazine-page bg-white p-8 flex flex-col">
            {page.type === 'cover' && (
              <div className="flex-1 flex flex-col items-center justify-center text-center border-4 border-amber-600">
                <p className="text-sm uppercase tracking-[0.3em] text-amber-700 mb-4">Kibritçi Şantiye</p>
                <h1 className="text-4xl font-black text-slate-900 mb-2">{page.title}</h1>
                <p className="text-lg text-slate-600">{page.subtitle}</p>
                <p className="mt-8 text-xs text-slate-400">{fotolar.length} saha fotoğrafı</p>
              </div>
            )}
            {page.type === 'toc' && (
              <div>
                <h2 className="text-2xl font-black text-slate-900 border-b-4 border-amber-500 pb-2 mb-6">{page.title}</h2>
                <ul className="space-y-3">
                  {(page.groups || []).map((g, i) => (
                    <li key={i} className="flex justify-between text-sm border-b border-slate-100 pb-2">
                      <span className="font-bold">{g.ad}</span>
                      <span className="text-slate-500">{g.count} foto</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {page.type === 'section' && (
              <div className="flex-1 flex flex-col justify-center">
                <p className="text-xs uppercase tracking-widest text-amber-600 mb-2">Bölüm</p>
                <h2 className="text-3xl font-black text-slate-900">{page.title}</h2>
                {page.subtitle && <p className="text-slate-500 mt-2">{page.subtitle}</p>}
              </div>
            )}
            {page.type === 'spread' && (
              <div className="flex-1">
                {page.title && page.title !== 'Genel Saha Faaliyetleri' && (
                  <p className="text-[10px] uppercase text-amber-700 font-bold mb-3">{page.title}</p>
                )}
                <div className="grid grid-cols-2 gap-3 flex-1">
                  {(page.photos || []).map((f) => (
                    <div key={f.id} className="flex flex-col gap-1">
                      <img src={f.imageUrl} alt="" className="w-full aspect-[4/3] object-cover rounded border" />
                      {f.baslik && <p className="text-[10px] font-bold text-slate-800">{f.baslik}</p>}
                      {f.aciklama && <p className="text-[10px] text-slate-700 leading-snug break-words">{f.aciklama}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {page.type === 'collage' && (
              <div>
                <h2 className="text-xl font-black mb-4">{page.title}</h2>
                <div className="grid grid-cols-6 gap-1">
                  {(page.photos || []).map((f) => (
                    <img key={f.id} src={f.imageUrl} alt="" className="w-full aspect-square object-cover rounded-sm" />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Preview modal */}
      {showPreview && (
        <div className="no-print fixed inset-0 z-50 bg-slate-950/80 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 p-4 bg-slate-900 text-white shrink-0">
            <div className="flex items-center gap-3">
              <Eye size={18} />
              <span className="font-bold text-sm">
                {viewMode === 'dergi' ? 'Dergi Önizleme' : 'Kolaj Önizleme'} — {albumBaslik(yil, ay)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode('dergi')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${viewMode === 'dergi' ? 'bg-amber-500 text-slate-900' : 'bg-slate-700'}`}
              >
                Dergi
              </button>
              <button
                type="button"
                onClick={() => setViewMode('kolaj')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${viewMode === 'kolaj' ? 'bg-violet-500 text-white' : 'bg-slate-700'}`}
              >
                Kolaj
              </button>
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="px-3 py-1.5 bg-white text-slate-900 rounded-lg text-xs font-bold flex items-center gap-1 disabled:opacity-50"
              >
                {downloadingPdf ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} 
                {downloadingPdf ? 'İndiriliyor...' : 'PDF İndir'}
              </button>
              <button type="button" onClick={() => setShowPreview(false)} className="p-2 hover:bg-slate-700 rounded-lg">
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 bg-slate-100">
            {viewMode === 'dergi' ? (
              <div className="max-w-3xl mx-auto space-y-6">
                {magazinePages.map((page, idx) => (
                  <div key={idx} className="bg-white shadow-2xl rounded-xl overflow-hidden min-h-[480px] p-8 relative flex flex-col border border-slate-100">
                    <div className="absolute inset-0 z-0 flex items-center justify-center opacity-5 pointer-events-none">
                      <img src={KIBRITCI_LOGO_PATH} alt="" className="w-2/3 h-auto grayscale" />
                    </div>
                    
                    <div className="relative z-10 flex-1 flex flex-col">
                      {page.type === 'cover' && (
                        <div className="flex-1 flex flex-col items-center justify-center text-center border-4 border-slate-800 p-8 bg-white/50 backdrop-blur-sm rounded-xl">
                          <img src={KIBRITCI_LOGO_PATH} alt="Kibritçi" className="w-48 mb-8 drop-shadow-md" />
                          <p className="text-sm font-bold uppercase tracking-[0.3em] text-slate-500 mb-2">Şantiye Saha Raporu</p>
                          <h1 className="text-4xl md:text-5xl font-black text-slate-900 mt-2 leading-tight uppercase tracking-tight">{page.title}</h1>
                          <p className="text-slate-600 mt-6 text-lg font-medium">{page.subtitle}</p>
                          <div className="mt-12 h-1 w-20 bg-amber-500 rounded-full"></div>
                        </div>
                      )}
                      {page.type === 'toc' && (
                        <div className="flex-1">
                          <h2 className="text-3xl font-black text-slate-900 border-b-4 border-amber-500 pb-3 mb-6 flex items-center gap-3">
                            <BookOpen className="text-amber-500" />
                            {page.title}
                          </h2>
                          <ul className="space-y-3">
                            {(page.groups || []).map((g, i) => (
                              <li key={i} className="flex justify-between items-center text-base py-2 border-b border-slate-200">
                                <span className="font-bold text-slate-800 flex items-center gap-2">
                                  <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs text-slate-500">{i + 1}</span>
                                  {g.ad}
                                </span>
                                <span className="text-slate-500 font-medium px-3 py-1 bg-slate-100 rounded-full text-xs">{g.count} fotoğraf</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {page.type === 'section' && (
                        <div className="flex-1 flex flex-col justify-center items-center text-center bg-slate-50/80 rounded-2xl border-2 border-slate-100">
                          <div className="w-16 h-1 bg-amber-500 mb-6 rounded-full"></div>
                          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">Bölüm</p>
                          <h2 className="text-4xl font-black text-slate-800">{page.title}</h2>
                          <p className="text-slate-500 font-medium mt-4 bg-white px-4 py-1.5 rounded-full shadow-sm">{page.subtitle}</p>
                        </div>
                      )}
                      {page.type === 'spread' && (
                        <div className="flex-1 flex flex-col items-center">
                          {page.title && page.title !== 'Genel Saha Faaliyetleri' && (
                            <div className="mb-6 inline-flex items-center gap-2 px-4 py-1.5 bg-slate-800 text-white rounded-full text-sm font-bold w-fit">
                              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                              {page.title}
                            </div>
                          )}
                          <div className={`flex flex-wrap justify-center gap-6 ${page.photos?.length === 1 ? 'max-w-2xl' : 'w-full'}`}>
                            {(page.photos || []).map((f) => (
                              <div key={f.id} className={`group flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden ${page.photos?.length === 1 ? 'w-full' : 'w-[calc(50%-0.75rem)]'}`}>
                                <img src={f.imageUrl} alt="" className="w-full aspect-[4/3] object-cover" />
                                <div className="p-4 bg-white border-t border-slate-100 flex-1 flex flex-col">
                                  <p className="text-base font-black text-slate-800 leading-tight">{f.baslik}</p>
                                  {f.aciklama && <p className="text-sm text-slate-600 mt-2 flex-1">{f.aciklama}</p>}
                                  {f.grupAdi && <p className="text-xs font-bold text-amber-600 mt-3 uppercase tracking-wider">{f.grupAdi}</p>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {page.type === 'collage' && (
                        <div className="flex-1">
                          <h2 className="text-2xl font-black text-slate-800 mb-4 flex items-center gap-2">
                            <Grid3X3 className="text-amber-500" />
                            {page.title}
                          </h2>
                          <div className="grid grid-cols-4 sm:grid-cols-6 gap-1 bg-slate-900 p-1 rounded-xl">
                            {(page.photos || []).map((f) => (
                              <img key={f.id} src={f.imageUrl} alt="" className="w-full aspect-square object-cover rounded-sm border border-slate-800" />
                            ))}
                          </div>
                        </div>
                      )}
                      {page.type === 'summary' && (
                        <div className="flex-1 flex flex-col">
                          <h2 className="text-3xl font-black text-slate-900 border-b-4 border-amber-500 pb-3 mb-6 flex items-center gap-3">
                            <Layers className="text-amber-500" />
                            {page.title}
                          </h2>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {(page.summaryData || []).map((s, i) => (
                              <div key={i} className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                                <div className="flex justify-between items-center mb-2">
                                  <h3 className="font-bold text-lg text-slate-800">Parsel: {s.parsel}</h3>
                                  <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-1 rounded-full">{s.count} Fotoğraf</span>
                                </div>
                                <p className="text-xs text-slate-500 font-medium">Bloklar: {s.bloks.join(', ')}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="max-w-6xl mx-auto space-y-8">
                {kolajGruplar.map((g) => (
                  <div key={g.ad} className="bg-white rounded-xl p-4 shadow-lg">
                    <h3 className="font-black text-slate-800 mb-3 border-l-4 border-violet-500 pl-3">{g.ad}</h3>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-1">
                      {g.fotolar.map((f) => (
                        <div key={f.id} className="relative group">
                          <img src={f.imageUrl} alt="" className="w-full aspect-square object-cover rounded" />
                          {f.baslik && (
                            <p className="absolute bottom-0 inset-x-0 bg-black/60 text-[8px] text-white p-0.5 truncate opacity-0 group-hover:opacity-100">
                              {f.baslik}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Expanded Image Modal */}
      {expandedImage && (
        <div 
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm cursor-zoom-out animate-in fade-in duration-200"
          onClick={() => setExpandedImage(null)}
        >
          <div className="relative max-w-7xl max-h-screen w-full h-full flex items-center justify-center">
            <button 
              className="absolute top-4 right-4 text-white hover:text-rose-500 bg-black/50 hover:bg-black p-3 rounded-full transition-all z-10"
              onClick={() => setExpandedImage(null)}
            >
              <X size={24} />
            </button>
            <img 
              src={expandedImage} 
              alt="Büyük Görünüm" 
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-200" 
            />
          </div>
        </div>
      )}
    </div>
  );
};
