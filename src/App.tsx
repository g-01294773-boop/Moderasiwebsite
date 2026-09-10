import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileText, User, Info, ChevronRight, Hash, ClipboardList, Plus, Trash2, Users, X, Settings, Upload, Save, CheckCircle, Lock, Archive, Edit, FileDown, Clock, Search, Cloud } from 'lucide-react';
import { collection, doc, onSnapshot, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { db } from './firebase';
import { initAuth, googleSignIn, getAccessToken, logout } from './lib/firebase-auth';
import type { User as FirebaseUser } from 'firebase/auth';

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

const subjectColors: Record<string, string> = {
  "BAHASA MELAYU": "bg-red-50 border-red-200",
  "MELAYU": "bg-red-50 border-red-200",
  "BAHASA INGGERIS": "bg-blue-50 border-blue-200",
  "INGGERIS": "bg-blue-50 border-blue-200",
  "MATHEMATICS": "bg-emerald-50 border-emerald-200",
  "MATEMATIK": "bg-emerald-50 border-emerald-200",
  "SCIENCE": "bg-amber-50 border-amber-200",
  "SAINS": "bg-amber-50 border-amber-200",
  "PENDIDIKAN ISLAM": "bg-green-50 border-green-200",
  "ISLAM": "bg-green-50 border-green-200",
  "PENDIDIKAN JASMANI": "bg-orange-50 border-orange-200",
  "PENDIDIKAN KESIHATAN": "bg-rose-50 border-rose-200",
  "PENDIDIKAN SENI VISUAL": "bg-purple-50 border-purple-200",
  "PENDIDIKAN MUZIK": "bg-fuchsia-50 border-fuchsia-200",
  "MUZIK": "bg-fuchsia-50 border-fuchsia-200",
  "BAHASA ARAB": "bg-teal-50 border-teal-200",
  "BAHASA IBAN": "bg-cyan-50 border-cyan-200",
  "SEJARAH": "bg-yellow-50 border-yellow-200",
  "REKA BENTUK TEKNOLOGI": "bg-indigo-50 border-indigo-200",
  "RBT": "bg-indigo-50 border-indigo-200",
};

const getSubjectColor = (subject: string | undefined | null) => {
  if (!subject) return "bg-white border-slate-100";
  const upper = subject.toUpperCase();
  for (const [key, val] of Object.entries(subjectColors)) {
    if (upper.includes(key)) return val;
  }
  const colors = [
    "bg-sky-50 border-sky-200",
    "bg-pink-50 border-pink-200",
    "bg-violet-50 border-violet-200",
    "bg-lime-50 border-lime-200",
  ];
  let hash = 0;
  for (let i = 0; i < upper.length; i++) {
    hash = upper.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export default function App() {
  const [needsAuth, setNeedsAuth] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [googleUser, setGoogleUser] = useState<FirebaseUser | null>(null);

  useEffect(() => {
    initAuth(
      (user, token) => {
        setGoogleUser(user);
        setDriveToken(token);
        setNeedsAuth(false);
      },
      () => setNeedsAuth(true)
    );
  }, []);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setDriveToken(result.accessToken);
        setGoogleUser(result.user);
        setNeedsAuth(false);
      }
    } catch (err) {
      console.error('Login failed:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setDriveToken(null);
    setGoogleUser(null);
    setNeedsAuth(true);
  };


  const defaultRows = Array.from({ length: 10 }, (_, i) => ({
    bil: i + 1,
    calon: '',
    skorGMP: '',
    skorKP: '',
    beza: '',
    akur: false,
    tidakAkur: false,
    kesilapan: false,
  }));

  const [rows, setRows] = useState(defaultRows);

  type TabType = 'borang' | 'rekod' | 'admin' | 'imbas';
  const [activeTab, setActiveTab] = useState<TabType>('borang');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  // Data Admin state
  const [customLogo, setCustomLogo] = useState<string | null>(null);
  
  const defaultGuruList: string[] = [];
  
  const [guruList, setGuruList] = useState<string[]>(defaultGuruList);
  const defaultMataPelajaran = [
    "BAHASA MELAYU", "BAHASA INGGERIS", "MATHEMATICS", "SCIENCE",
    "PENDIDIKAN ISLAM", "PENDIDIKAN JASMANI", "PENDIDIKAN KESIHATAN",
    "PENDIDIKAN SENI VISUAL", "PENDIDIKAN MUZIK", "BAHASA ARAB",
    "BAHASA IBAN", "SEJARAH", "REKA BENTUK TEKNOLOGI"
  ];
  const [subjekList, setSubjekList] = useState<string[]>(defaultMataPelajaran);
  const [muridList, setMuridList] = useState<{nama: string, kelas: string}[]>([]);

  const [newGuruName, setNewGuruName] = useState('');
  const [newSubjekName, setNewSubjekName] = useState('');

  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('Data Berjaya Disimpan');
  const [newManualMurid, setNewManualMurid] = useState({ nama: '', kelas: '' });

  // Rekod Pengisian (Saved sessions for forms)
  type Rekod = {
    id: string;
    timestamp: string;
    info: {
      namaPentaksir: string;
      namaGuru: string;
      sekolah: string;
      mataPelajaran: string;
      tarikh: string;
    };
    rows: typeof rows;
    muridCount: number;
  };

  const [rekodList, setRekodList] = useState<Rekod[]>([]);
  const [editingRekodId, setEditingRekodId] = useState<string | null>(null);

  // Sync with Firestore
  useEffect(() => {
    // Logo
    const unSubLogo = onSnapshot(doc(db, "admin", "logo"), (docSnap) => {
      if (docSnap.exists() && docSnap.data().data) {
        setCustomLogo(docSnap.data().data);
      }
    });

    // Guru
    const unSubGuru = onSnapshot(doc(db, "admin", "guru"), (docSnap) => {
      if (docSnap.exists() && docSnap.data().list) {
        setGuruList(docSnap.data().list);
      }
    });

    // Subjek
    const unSubSubjek = onSnapshot(doc(db, "admin", "subjek"), (docSnap) => {
      if (docSnap.exists() && docSnap.data().list) {
        setSubjekList(docSnap.data().list);
      }
    });

    // Murid
    const unSubMurid = onSnapshot(doc(db, "admin", "murid"), (docSnap) => {
      if (docSnap.exists() && docSnap.data().list) {
        setMuridList(docSnap.data().list);
      }
    });

    // Rekod
    const qRekod = query(collection(db, "rekod"));
    const unSubRekod = onSnapshot(qRekod, (snapshot) => {
      const rekods: Rekod[] = [];
      snapshot.forEach((doc) => {
        rekods.push({ id: doc.id, ...doc.data() } as Rekod);
      });
      // Sort by timestamp descending
      rekods.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setRekodList(rekods);
    });

    return () => {
      unSubLogo();
      unSubGuru();
      unSubSubjek();
      unSubMurid();
      unSubRekod();
    };
  }, []);

  const [info, setInfo] = useState({
    namaPentaksir: '',
    namaGuru: '',
    sekolah: 'SEKOLAH KEBANGSAAN TUDAN',
    guruBesar: 'LIM AI GIOK',
    mataPelajaran: '',
    tarikh: '',
    catatanPMP: '',
    catatanKP: '',
    catatanSkor: ''
  });

  const [showManageModal, setShowManageModal] = useState(false);
  const [pasteNames, setPasteNames] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);

  // Simulate file reading progress
  const simulateProgress = (type: string, callback: () => void) => {
    setUploadProgress(prev => ({ ...prev, [type]: 0 }));
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 20) + 10;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        callback();
      }
      setUploadProgress(prev => ({ ...prev, [type]: progress }));
    }, 200);
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'guru' | 'subjek' | 'murid') => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    simulateProgress(type, () => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (type === 'guru') {
          updateAdminData('guru', lines);
        } else if (type === 'subjek') {
          updateAdminData('subjek', lines);
          if (lines.length > 0 && !info.mataPelajaran) {
            setInfo(prev => ({...prev, mataPelajaran: lines[0]}));
          }
        } else if (type === 'murid') {
          let nameIdx = 0;
          let classIdx = 1;
          
          if (lines.length > 0) {
            const headers = lines[0].toUpperCase().split(',').map(h => h.trim());
            const n = headers.findIndex(h => h.includes('NAMA') || h.includes('NAME') || h === 'MURID');
            const c = headers.findIndex(h => h.includes('KELAS') || h.includes('TINGKATAN') || h.includes('TAHUN') || h.includes('CLASS'));
            
            if (n !== -1) nameIdx = n;
            if (c !== -1) classIdx = c;
            
            if (n !== -1 || c !== -1) {
              lines.shift();
            }
          }

          const parsed = lines.map(l => {
            const parts = l.split(',');
            return { 
              nama: (parts[nameIdx] || '').replace(/"/g, '').trim().toUpperCase(), 
              kelas: (parts[classIdx] || '').replace(/"/g, '').trim().toUpperCase() 
            };
          }).filter(m => m.nama);
          
          updateAdminData('murid', parsed);
        }
      };
      reader.readAsText(file);
    });
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    simulateProgress('logo', () => {
      const reader = new FileReader();
      reader.onload = (event) => {
        updateAdminData('logo', event.target?.result as string);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSaveData = () => {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const showCustomToast = (msg: string) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const addManualMurid = () => {
    if (newManualMurid.nama.trim()) {
      const newList = [...muridList, { 
        nama: newManualMurid.nama.trim(), 
        kelas: newManualMurid.kelas.trim() 
      }];
      updateAdminData('murid', newList);
      setNewManualMurid({ nama: '', kelas: '' });
      handleSaveData();
    }
  };

  const getFilteredMuridList = () => {
      if (muridList.length === 0) return [];
      if (!info.mataPelajaran) return muridList;
      
      const target = info.mataPelajaran.toLowerCase().replace(/[^a-z0-9]/g, '');
      const filtered = muridList.filter(m => {
          if (!m.kelas) return false;
          const kelasStr = m.kelas.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (kelasStr === '') return false;
          return target.includes(kelasStr) || kelasStr.includes(target);
      });
      
      return filtered.length > 0 ? filtered : muridList;
  };
  
  const filteredMuridList = getFilteredMuridList();

  const updateAdminData = async (type: 'guru' | 'subjek' | 'murid' | 'logo', data: any) => {
    try {
      if (type === 'logo') {
        await setDoc(doc(db, 'admin', 'logo'), { data });
      } else {
        await setDoc(doc(db, 'admin', type), { list: data });
      }
    } catch (error) {
      console.error("Error saving to Firebase:", error);
    }
  };

  const handleInfo = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setInfo({ ...info, [e.target.name]: e.target.value });
  };

  const handleSimpanBorangUtama = async () => {
    const newRekodId = editingRekodId || Date.now().toString();
    const newRekod: Rekod = {
      id: newRekodId,
      timestamp: new Date().toISOString(),
      info: { ...info },
      rows: [...rows],
      muridCount: filteredMuridList.length
    };

    try {
      await setDoc(doc(db, 'rekod', newRekodId), newRekod);
      if (editingRekodId) {
        showCustomToast('Rekod berjaya dikemaskini');
      } else {
        showCustomToast('Rekod borang berjaya disimpan');
        setEditingRekodId(newRekodId);
      }
    } catch (error) {
      console.error("Error saving rekod:", error);
      alert("Gagal menyimpan rekod ke pelayan.");
    }
  };

  const handleExportToGoogleSheet = async () => {
    let token = await getAccessToken();
    if (!token) {
        if (needsAuth) { 
            await handleLogin();
            token = await getAccessToken();
        } else {
            console.error("Auth mismatch. Token missing.");
            return;
        }
    }
    
    if (!token) {
        alert("Sila log masuk untuk meneruskan.");
        return;
    }

    const initPicker = (accessToken: string) => {
        const loadGapi = () => {
            window.gapi.load('picker', () => {
                const picker = new window.google.picker.PickerBuilder()
                    .addView(window.google.picker.ViewId.SPREADSHEETS)
                    .setAppId('gen-lang-client-0890403762')
                    .setOAuthToken(accessToken)
                    .setCallback(async (data: any) => {
                        if (data.action === window.google.picker.Action.PICKED) {
                            const fileId = data.docs[0].id;
                            
                            try {
                              setIsSyncingSheet(true);
                              
                              // First, fetch the spreadsheet metadata to get the first sheet's name
                              const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${fileId}`, {
                                  headers: { Authorization: `Bearer ${accessToken}` }
                              });
                              if (!metaRes.ok) throw new Error("Gagal mengambil maklumat hamparan kerja");
                              const metaData = await metaRes.json();
                              const firstSheetName = metaData.sheets[0].properties.title;

                              const sheetRows = rows.filter(r => r.calon).map((r, idx) => [
                                info.mataPelajaran || "-",
                                info.kelas || "-",
                                info.tarikh || "-",
                                info.namaGuru || "-",
                                info.namaPentaksir || "-",
                                r.bil || (idx + 1).toString(),
                                r.calon || "-",
                                r.skorGMP || "-",
                                r.skorKP || "-"
                              ]);
                              
                              const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${fileId}/values/${encodeURIComponent(firstSheetName)}!A:I:append?valueInputOption=USER_ENTERED`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${accessToken}`,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    range: `${firstSheetName}!A:I`,
                                    majorDimension: "ROWS",
                                    values: sheetRows
                                })
                              });
                              
                              if (!response.ok) {
                                  const errorData = await response.json();
                                  alert("Ralat semasa menyimpan ke Google Sheets: " + (errorData.error?.message || "Unknown error"));
                              } else {
                                  showCustomToast("Rekod berjaya dihantar ke Google Sheets!");
                              }
                            } catch (error) {
                                console.error(error);
                                alert("Gagal menghubungi Google API.");
                            } finally {
                                setIsSyncingSheet(false);
                            }
                        }
                    })
                    .build();
                picker.setVisible(true);
            });
        };

        if (window.gapi) {
            loadGapi();
        } else {
            const script = document.createElement('script');
            script.src = 'https://apis.google.com/js/api.js';
            script.onload = loadGapi;
            document.body.appendChild(script);
        }
    };
    initPicker(token);
  };

  const handleEditRekod = (rek: Rekod) => {
    setInfo(rek.info as any); // Cast as standard info type
    setRows(rek.rows);
    setEditingRekodId(rek.id);
    setActiveTab('borang');
  };

  const clearForm = () => {
    setEditingRekodId(null);
    setInfo({
      namaPentaksir: '',
      namaGuru: '',
      sekolah: 'SEKOLAH KEBANGSAAN TUDAN',
      guruBesar: 'LIM AI GIOK',
      mataPelajaran: '',
      tarikh: '',
      catatanPMP: '',
      catatanKP: '',
      catatanSkor: ''
    });
    setRows(defaultRows);
  };

  const handleDeleteRekod = async (id: string) => {
    if(confirm('Adakah anda pasti untuk memadam rekod ini secara kekal?')) {
      try {
        await deleteDoc(doc(db, 'rekod', id));
        if (editingRekodId === id) {
          clearForm();
        }
        showCustomToast('Rekod berjaya dipadam');
      } catch (error) {
         console.error("Error deleting rekod:", error);
         alert("Gagal memadam rekod.");
      }
    }
  };

  const handleScore = (index: number, field: 'skorGMP' | 'skorKP', value: string) => {
    const updated = [...rows];
    updated[index][field] = value;
    
    // Auto calculate beza, akur, tidak akur based on formula:
    // BEZA = MIN(100, ABS(skorGMP - skorKP)) / 100
    // AKUR = < 5%, TIDAK AKUR = >= 5%
    const gmpStr = updated[index].skorGMP;
    const kpStr = updated[index].skorKP;

    if (gmpStr !== '' && kpStr !== '') {
      const gmp = parseInt(gmpStr, 10);
      const kp = parseInt(kpStr, 10);
      const diff = Math.abs(gmp - kp);
      
      updated[index].beza = diff + '%';
      
      if (diff < 5) {
        updated[index].akur = true;
        updated[index].tidakAkur = false;
      } else {
        updated[index].akur = false;
        updated[index].tidakAkur = true;
      }
    } else {
      updated[index].beza = '';
      updated[index].akur = false;
      updated[index].tidakAkur = false;
    }
    
    setRows(updated);
  };

  const handleRadio = (index: number, selection: 'akur' | 'tidakAkur') => {
    const updated = [...rows];
    if (selection === 'akur') {
      updated[index].akur = true;
      updated[index].tidakAkur = false;
    } else {
      updated[index].akur = false;
      updated[index].tidakAkur = true;
    }
    setRows(updated);
  };

  const handleCheck = (index: number) => {
    const updated = [...rows];
    updated[index].kesilapan = !updated[index].kesilapan;
    setRows(updated);
  };

  const clearData = () => {
    if (window.confirm('Adakah anda pasti mahu memadam semua senarai calon dan markah?')) {
      setRows(defaultRows);
      setShowManageModal(false);
    }
  };

  const applyPastedNames = () => {
    const names = pasteNames.split('\n').map(n => n.trim()).filter(n => n.length > 0);
    if (names.length > 0) {
      const newRows = names.map((name, i) => ({
        bil: i + 1,
        calon: name,
        skorGMP: '',
        skorKP: '',
        beza: '',
        akur: false,
        tidakAkur: false,
        kesilapan: false,
      }));
      
      if (newRows.length < 10) {
        const remaining = 10 - newRows.length;
        for (let i = 0; i < remaining; i++) {
          newRows.push({
            bil: newRows.length + 1,
            calon: '',
            skorGMP: '',
            skorKP: '',
            beza: '',
            akur: false,
            tidakAkur: false,
            kesilapan: false,
          });
        }
      }
      
      setRows(newRows);
    }
    setPasteNames('');
    setShowManageModal(false);
  };
  
  const addSingleRow = () => {
    setRows([...rows, {
      bil: rows.length + 1,
      calon: '',
      skorGMP: '',
      skorKP: '',
      beza: '',
      akur: false,
      tidakAkur: false,
      kesilapan: false,
    }]);
  };

  const normalizeImageToBase64 = async (imageUrlOrBase64: string): Promise<string | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } else {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = imageUrlOrBase64;
    });
  };

  const generatePDF = async () => {
    setIsGenerating(true);
    const doc = new jsPDF('p', 'mm', 'a4');
    
    const totalAkur = rows.filter(r => r.akur).length;
    const totalTidakAkur = rows.filter(r => r.tidakAkur).length;
    const totalKesilapan = rows.filter(r => r.kesilapan).length;
    
    const assessedRows = rows.filter(r => r.akur || r.tidakAkur);
    const totalAssessed = Math.max(assessedRows.length, 1);
    
    const peratusAkur = Math.round((totalAkur / totalAssessed) * 100);
    const peratusTidakAkur = Math.round((totalTidakAkur / totalAssessed) * 100);
    const peratusKesilapan = Math.round((totalKesilapan / totalAssessed) * 100);

    const defaultLogoUrl = 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/Coat_of_arms_of_Malaysia.svg/150px-Coat_of_arms_of_Malaysia.svg.png';
    const logoBase64 = await normalizeImageToBase64(customLogo || defaultLogoUrl);
    
    let currentY = 15;
    
    if (logoBase64) {
       doc.addImage(logoBase64, 'PNG', 95, currentY, 20, 16);
       currentY += 20;
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('KEMENTERIAN PENDIDIKAN MALAYSIA', 105, currentY, { align: 'center' });
    currentY += 5;
    doc.text('LEMBAGA PEPERIKSAAN', 105, currentY, { align: 'center' });
    currentY += 7;
    doc.setFontSize(9);
    doc.text('BORANG MODERASI PENSKORAN (Ujian Akhir Sesi Akademik 2026)', 105, currentY, { align: 'center' });
    currentY += 10;
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    
    const drawField = (label: string, value: string, yPos: number) => {
      doc.text(label, 15, yPos);
      doc.setDrawColor(120);
      doc.setLineWidth(0.3);
      doc.setLineDashPattern([0.5, 1], 0);
      doc.line(45, yPos + 1, 195, yPos + 1);
      doc.setLineDashPattern([], 0);
      doc.text(value, 46, yPos - 1);
    };
    
    drawField('Nama Pentaksir', info.namaPentaksir, currentY);
    drawField('Nama Guru', info.namaGuru, currentY + 8);
    drawField('Sekolah', info.sekolah, currentY + 16);
    drawField('Mata Pelajaran', info.mataPelajaran, currentY + 24);
    drawField('Tarikh', info.tarikh, currentY + 32);

    currentY += 40;

    const headers = [
      'BIL',
      'CALON',
      'SKOR GMP',
      'SKOR KP',
      'PERATUS\nBEZA SKOR',
      'AKUR PANDUAN\nPENSKORAN',
      'TIDAK AKUR\nPANDUAN\nPENSKORAN',
      'KESILAPAN\nMENJUMLAH',
    ];

    const body = rows.map((r) => [
      r.bil.toString(),
      r.calon || '-Sila Pilih -',
      r.skorGMP,
      r.skorKP,
      r.beza,
      r.akur ? 'TICK' : '', 
      r.tidakAkur ? 'TICK' : '',
      r.kesilapan ? 'TICK' : '',
    ]);

    body.push(['', 'JUMLAH', '', '', '', totalAkur.toString(), totalTidakAkur.toString(), totalKesilapan.toString()]);
    body.push(['', 'PERATUS', '', '', '', `${peratusAkur}%`, `${peratusTidakAkur}%`, `${peratusKesilapan}%`]);

    autoTable(doc, {
      startY: currentY,
      head: [headers],
      body: body,
      theme: 'grid',
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.3,
        halign: 'center',
        valign: 'middle',
        fontSize: 7,
        fontStyle: 'bold'
      },
      styles: {
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.2,
        valign: 'middle',
        fontSize: 8,
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { halign: 'left', cellWidth: 44 },
        2: { halign: 'center', cellWidth: 15 },
        3: { halign: 'center', cellWidth: 15 },
        4: { halign: 'center', cellWidth: 18 },
        5: { halign: 'center', cellWidth: 26 },
        6: { halign: 'center', cellWidth: 26 },
        7: { halign: 'center', cellWidth: 26 },
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          if (data.row.index < rows.length && data.column.index >= 5) {
            if (data.cell.raw === 'TICK') {
              data.cell.styles.font = 'zapfdingbats';
              data.cell.text = ['4'];
            } else {
              data.cell.text = [''];
            }
          }
          if (data.row.index >= rows.length && (data.column.index === 2 || data.column.index === 3 || data.column.index === 4)) {
            data.cell.styles.fillColor = [160, 150, 110];
          }
          if (data.row.index >= rows.length && data.column.index === 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.halign = 'center';
          }
        }
      }
    });

    let endY = (doc as any).lastAutoTable.finalY + 8;
    
    if (endY > 230) {
       doc.addPage();
       endY = 20;
    }

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('CATATAN PENTAKSIR :', 15, endY);
    
    doc.setFont('helvetica', 'normal');
    
    let wrapY = endY + 4;
    
    // 1. GMP
    doc.text('1.', 15, wrapY);
    doc.text('GMP', 20, wrapY);
    let kw1w = doc.getTextWidth('GMP');
    doc.setFont('helvetica', 'bold');
    let v1 = info.catatanPMP || 'PERLU / TIDAK PERLU';
    doc.text(v1, 20 + kw1w + 2, wrapY);
    let v1w = doc.getTextWidth(v1);
    doc.setFont('helvetica', 'normal');
    doc.text('membuat penskoran semula', 20 + kw1w + 2 + v1w + 2, wrapY);
    let pw = doc.getTextWidth('membuat penskoran semula');
    doc.setFont('helvetica', 'bold');
    doc.text('SEMUA', 20 + kw1w + 2 + v1w + 2 + pw + 2, wrapY);
    let sw = doc.getTextWidth('SEMUA');
    doc.setFont('helvetica', 'normal');
    doc.text('SJC UASA di bawah', 20 + kw1w + 2 + v1w + 2 + pw + 2 + sw + 2, wrapY);
    wrapY += 4;
    doc.text('tanggungjawabnya.', 20, wrapY);
    
    wrapY += 4;

    // 2. KPMP
    doc.text('2.', 15, wrapY);
    let label2 = 'Ketua Pentaksir Mata Pelajaran (KPMP)';
    doc.text(label2, 20, wrapY);
    let label2w = doc.getTextWidth(label2);
    doc.setFont('helvetica', 'bold');
    let v2 = info.catatanKP || 'PERLU / TIDAK PERLU';
    doc.text(v2, 20 + label2w + 2, wrapY);
    let v2w = doc.getTextWidth(v2);
    doc.setFont('helvetica', 'normal');
    doc.text('menjalankan semula Moderasi Penskoran', 20 + label2w + 2 + v2w + 2, wrapY);
    wrapY += 4;
    doc.text('SJC UASA bagi skrip yang dibuat penskoran semula.', 20, wrapY);
    
    wrapY += 4;

    // 3. Skor
    doc.text('3.', 15, wrapY);
    doc.text('Skor', 20, wrapY);
    let label3w = doc.getTextWidth('Skor');
    doc.setFont('helvetica', 'bold');
    let v3 = info.catatanSkor || 'BOLEH / TIDAK BOLEH';
    doc.text(v3, 20 + label3w + 2, wrapY);
    let v3w = doc.getTextWidth(v3);
    doc.setFont('helvetica', 'normal');
    doc.text('dihantar ke Lembaga Peperiksaan.', 20 + label3w + 2 + v3w + 2, wrapY);

    wrapY += 4;

    // 4. Salinan
    doc.text('4.', 15, wrapY);
    doc.text('Menyerahkan sesalinan kepada sekolah.', 20, wrapY);

    endY = wrapY + 16;
    doc.setFontSize(9);
    doc.text('Tandatangan :', 15, endY);
    doc.text('Pengesahan Pengetua/Guru Besar:', 130, endY);
    
    endY += 20;

    doc.setLineDashPattern([], 0);
    doc.line(15, endY - 4, 65, endY - 4);
    doc.line(130, endY - 4, 190, endY - 4);

    doc.setFont('helvetica', 'bold');
    doc.text(info.namaPentaksir ? info.namaPentaksir.toUpperCase() : 'PENTAKSIR', 40, endY, {align: 'center'});
    
    doc.text(info.guruBesar ? info.guruBesar.toUpperCase() : 'LIM AI GIOK', 160, endY, {align: 'center'});
    doc.text(info.sekolah ? info.sekolah.toUpperCase() : 'SK TUDAN, MIRI', 160, endY + 4, {align: 'center'});

    doc.save('Borang_Moderasi_Penskoran.pdf');
    setIsGenerating(false);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans mb-32 pb-6">
      
      {/* Toast Notification */}
      {showToast && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 bg-green-600 text-white px-5 py-3 rounded-xl shadow-2xl z-50 flex items-center gap-3 animate-in fade-in slide-in-from-top-5">
           <CheckCircle size={20} />
           <span className="font-bold text-sm">{toastMessage}</span>
        </div>
      )}

      {/* Admin Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col animate-in zoom-in-95">
            <div className="p-6 space-y-5 text-center">
              <div className="mx-auto w-12 h-12 bg-blue-100 text-blue-600 flex items-center justify-center rounded-full mb-4">
                <Lock size={24} />
              </div>
              <h2 className="font-bold text-slate-800 text-lg">Akses Data Admin</h2>
              <p className="text-xs text-slate-500 pb-2">Sila masukkan kata laluan untuk mengakses modul ini. (Klu: admin123)</p>
              
              <input 
                type="password"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-center text-lg focus:ring-2 focus:ring-blue-500 outline-none font-bold tracking-widest text-slate-800 transition-all"
                placeholder="••••••••"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (passwordInput === 'admin123') {
                      setIsAdminAuthenticated(true);
                      setShowPasswordModal(false);
                      setActiveTab('admin');
                      setPasswordInput('');
                    } else {
                      alert('Kata laluan salah!');
                    }
                  }
                }}
              />
              
              <div className="flex gap-2 pt-2">
                <button 
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPasswordInput('');
                  }}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 p-3.5 rounded-xl font-bold transition-colors"
                >
                  Batal
                </button>
                <button 
                  onClick={() => {
                    if (passwordInput === 'admin123') {
                      setIsAdminAuthenticated(true);
                      setShowPasswordModal(false);
                      setActiveTab('admin');
                      setPasswordInput('');
                    } else {
                      alert('Kata laluan salah!');
                    }
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white p-3.5 rounded-xl font-bold transition-colors"
                >
                  Log Masuk
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Datalists for input dropdowns */}
      <datalist id="senarai-guru">
        {guruList.map((g, i) => <option key={i} value={g} />)}
      </datalist>
      <datalist id="senarai-subjek">
        {subjekList.map((s, i) => <option key={i} value={s} />)}
      </datalist>
      <datalist id="senarai-calon">
        {filteredMuridList.map((m, i) => <option key={i} value={m.nama} />)}
      </datalist>

      {/* App Bar Fixed Header */}
      <div className="bg-blue-600 text-white p-5 md:p-6 shadow-sm z-10 sticky top-0">
         <div className="max-w-7xl mx-auto flex items-center justify-between w-full">
           <div>
              <h1 className="font-bold text-xl md:text-2xl leading-tight text-white/95">Moderasi Penskoran</h1>
              <span className="text-xs md:text-sm font-medium text-blue-200 flex items-center gap-1 mt-0.5">
                 <ClipboardList size={14}/> UASA 2026
              </span>
           </div>
           <div className="flex gap-2">
             <button 
               onClick={() => {
                 if (!isAdminAuthenticated) {
                   setShowPasswordModal(true);
                 } else {
                   setActiveTab('admin');
                 }
               }} 
               className={`${activeTab === 'admin' ? 'bg-blue-800' : 'bg-blue-700 hover:bg-blue-800'} text-white p-2.5 md:px-4 md:py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2`}
             >
               <Settings size={20} />
               <span className="hidden md:inline font-semibold text-sm">Data Admin</span>
             </button>
             <button 
               onClick={() => setActiveTab('rekod')} 
               className={`${activeTab === 'rekod' ? 'bg-blue-800' : 'bg-blue-700 hover:bg-blue-800'} text-white p-2.5 md:px-4 md:py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2`}
             >
               <Archive size={20} />
               <span className="hidden md:inline font-semibold text-sm">Rekod</span>
             </button>
             <button 
               onClick={() => setActiveTab('borang')} 
               className={`${activeTab === 'borang' ? 'bg-blue-800' : 'bg-blue-700 hover:bg-blue-800'} text-white p-2.5 md:px-4 md:py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2`}
             >
               <FileText size={20} />
               <span className="hidden md:inline font-semibold text-sm">Borang Manual</span>
             </button>
           </div>
         </div>
      </div>

      {activeTab === 'admin' && (
        <div className="flex-1 w-full max-w-4xl mx-auto p-4 md:p-6 mt-4">
           <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
              <div className="bg-slate-50 border-b border-slate-200 px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings size={18} className="text-blue-600" />
                  <h2 className="font-bold text-slate-800 tracking-tight">Maklumat & Konfigurasi Sistem</h2>
                </div>
                <button 
                  onClick={handleSaveData}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-sm transition-colors flex items-center gap-2"
                >
                  <Save size={16} /> Simpan Semua Data
                </button>
              </div>
              <div className="p-6 md:p-8 space-y-8">
                 
                 {/* Logo KPM */}
                 <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 relative overflow-hidden">
                   {uploadProgress['logo'] !== undefined && uploadProgress['logo'] < 100 && (
                     <div className="absolute top-0 left-0 h-1 bg-blue-500 transition-all duration-200" style={{width: `${uploadProgress['logo']}%`}}></div>
                   )}
                   <div className="flex justify-between items-start mb-2">
                     <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                        <Upload size={16} className="text-blue-600" />
                        Logo KPM (PNG / JPG)
                     </h3>
                     {customLogo && (
                       <button onClick={() => updateAdminData('logo', null)} className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors" title="Padam Logo">
                         <Trash2 size={16} />
                       </button>
                     )}
                   </div>
                   <p className="text-xs text-slate-500 mb-4 font-medium">Logo akan terpapar dalam borang pengisian dan fail PDF yang dijanakan.</p>
                   <input type="file" accept="image/*" onChange={handleLogoUpload} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-all cursor-pointer" />
                   {customLogo && <img src={customLogo} className="h-16 mt-4 object-contain mx-auto" alt="Logo KPM Preview" />}
                 </div>

                 {/* Guru CSV */}
                 <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 relative overflow-hidden">
                   {uploadProgress['guru'] !== undefined && uploadProgress['guru'] < 100 && (
                     <div className="absolute top-0 left-0 h-1 bg-blue-500 transition-all duration-200" style={{width: `${uploadProgress['guru']}%`}}></div>
                   )}
                   <div className="flex justify-between items-start mb-2">
                     <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                         <Upload size={16} className="text-blue-600" />
                         Senarai Guru (Format CSV)
                     </h3>
                     {guruList.length > 0 && (
                       <button onClick={() => updateAdminData('guru', [])} className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold">
                         <Trash2 size={14} /> Padam Data
                       </button>
                     )}
                   </div>
                   <p className="text-xs text-slate-500 mb-4 font-medium">Tampalkan atau muat naik csv yang mempunyai senarai nama guru (satu baris, satu nama). Akan diguna untuk pilihan drop-down "Nama Pentaksir" dan "Nama Guru".</p>
                   <input type="file" accept=".csv" onChange={(e) => handleCsvUpload(e, 'guru')} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-all cursor-pointer" />
                   {guruList.length > 0 && uploadProgress['guru'] === 100 && <div className="text-xs text-green-700 mt-3 font-bold bg-green-50 px-3 py-2 rounded-lg inline-block flex items-center gap-2"><CheckCircle size={14}/> {guruList.length} rekod nama guru berjaya dimuat naik.</div>}
                   
                   <div className="mt-4 border-t border-slate-200 pt-4 flex gap-2">
                     <input 
                       type="text" 
                       placeholder="Tambah Nama Guru Manual" 
                       value={newGuruName}
                       onChange={(e) => setNewGuruName(e.target.value)}
                       className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                     />
                     <button 
                       onClick={() => {
                         if(newGuruName.trim() && !guruList.includes(newGuruName.trim().toUpperCase())) {
                           updateAdminData('guru', [...guruList, newGuruName.trim().toUpperCase()]);
                           setNewGuruName('');
                         }
                       }}
                       className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1 transition-colors"
                     >
                       <Plus size={16}/> Tambah
                     </button>
                   </div>
                 </div>

                 {/* Mata Pelajaran CSV */}
                 <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 relative overflow-hidden">
                   {uploadProgress['subjek'] !== undefined && uploadProgress['subjek'] < 100 && (
                     <div className="absolute top-0 left-0 h-1 bg-blue-500 transition-all duration-200" style={{width: `${uploadProgress['subjek']}%`}}></div>
                   )}
                   <div className="flex justify-between items-start mb-2">
                     <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                         <Upload size={16} className="text-blue-600" />
                         Senarai Mata Pelajaran & Kelas (Format CSV)
                     </h3>
                     {subjekList.length > 0 && (
                       <button onClick={() => {updateAdminData('subjek', []); setInfo(prev => ({...prev, mataPelajaran: ''}));}} className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold">
                         <Trash2 size={14} /> Padam Data
                       </button>
                     )}
                   </div>
                   <p className="text-xs text-slate-500 mb-4 font-medium">Satu rekod per baris (cth: "BAHASA MELAYU 1 CEKAL"). Akan digunakan untuk drop-down "Mata Pelajaran".</p>
                   <input type="file" accept=".csv" onChange={(e) => handleCsvUpload(e, 'subjek')} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-all cursor-pointer" />
                   {subjekList.length > 0 && uploadProgress['subjek'] === 100 && <div className="text-xs text-green-700 mt-3 font-bold bg-green-50 px-3 py-2 rounded-lg inline-block flex items-center gap-2"><CheckCircle size={14}/> {subjekList.length} rekod matapelajaran berjaya dimuat naik.</div>}
                   
                   <div className="mt-4 border-t border-slate-200 pt-4 flex gap-2">
                     <input 
                       type="text" 
                       placeholder="Tambah Nama Mata Pelajaran Manual" 
                       value={newSubjekName}
                       onChange={(e) => setNewSubjekName(e.target.value)}
                       className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                     />
                     <button 
                       onClick={() => {
                         if(newSubjekName.trim() && !subjekList.includes(newSubjekName.trim().toUpperCase())) {
                           updateAdminData('subjek', [...subjekList, newSubjekName.trim().toUpperCase()]);
                           setNewSubjekName('');
                         }
                       }}
                       className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1 transition-colors"
                     >
                       <Plus size={16}/> Tambah
                     </button>
                   </div>
                 </div>

                 {/* Murid CSV & Manual Add */}
                 <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 relative overflow-hidden">
                   {uploadProgress['murid'] !== undefined && uploadProgress['murid'] < 100 && (
                     <div className="absolute top-0 left-0 h-1 bg-blue-500 transition-all duration-200" style={{width: `${uploadProgress['murid']}%`}}></div>
                   )}
                   <div className="flex justify-between items-start mb-2">
                     <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                         <Upload size={16} className="text-blue-600" />
                         Senarai Nama Murid & Kelas (Format CSV)
                     </h3>
                     {muridList.length > 0 && (
                       <button onClick={() => updateAdminData('murid', [])} className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold">
                         <Trash2 size={14} /> Padam Data
                       </button>
                     )}
                   </div>
                   <p className="text-xs text-slate-500 mb-4 font-medium">Sistem akan secara automatik mengekstrak ruangan <code className="bg-slate-200 px-1 rounded font-bold">NAMA</code> dan <code className="bg-slate-200 px-1 rounded font-bold">KELAS</code> dari fail CSV anda, walaupun fail mengandungi maklumat lain. Senarai ini dipaut secara automatik ke senarai calon mengikut kelas.</p>
                   <input type="file" accept=".csv" onChange={(e) => handleCsvUpload(e, 'murid')} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-all cursor-pointer mb-2" />
                   {muridList.length > 0 && uploadProgress['murid'] === 100 && <div className="text-xs text-green-700 mt-2 font-bold bg-green-50 px-3 py-2 rounded-lg inline-block flex items-center gap-2"><CheckCircle size={14}/> {muridList.length} rekod murid tersimpan.</div>}
                   
                   <div className="mt-6 border-t border-slate-200 pt-5">
                      <h4 className="font-bold text-xs text-slate-700 mb-3 uppercase tracking-wide">Tambah Murid Manual</h4>
                      <div className="flex gap-2 items-end">
                         <div className="flex-1 space-y-1">
                           <label className="text-[10px] font-bold text-slate-500 pl-1 uppercase">Nama Murid</label>
                           <input type="text" value={newManualMurid.nama} onChange={(e) => setNewManualMurid({...newManualMurid, nama: e.target.value})} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ali bin Abu" />
                         </div>
                         <div className="flex-1 space-y-1">
                           <label className="text-[10px] font-bold text-slate-500 pl-1 uppercase">Kelas</label>
                           <input type="text" value={newManualMurid.kelas} onChange={(e) => setNewManualMurid({...newManualMurid, kelas: e.target.value})} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="1 CEKAL" />
                         </div>
                         <button onClick={addManualMurid} disabled={!newManualMurid.nama} className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white p-2.5 rounded-lg flex items-center justify-center transition-colors">
                           <Plus size={20} />
                         </button>
                      </div>
                   </div>
                   {/* List of uploaded students */}
                   {muridList.length > 0 && (
                     <div className="mt-5 border-t border-slate-200 pt-5">
                       <h4 className="font-bold text-xs text-slate-700 mb-3 uppercase tracking-wide">Senarai Murid Semasa ({muridList.length})</h4>
                       <div className="max-h-[300px] overflow-y-auto pr-2 space-y-2 relative custom-scrollbar">
                         {muridList.map((m, i) => (
                           <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white border border-slate-200 p-2.5 rounded-lg gap-2">
                             <div className="flex flex-col">
                               <span className="text-xs font-bold text-slate-800">{m.nama}</span>
                               <span className="text-[10px] uppercase font-semibold text-slate-500">{m.kelas || 'Tiada Kelas'}</span>
                             </div>
                             <div className="flex items-center gap-2 shrink-0">
                               <button 
                                 onClick={() => {
                                   const newName = prompt('Kemaskini Nama:', m.nama);
                                   const newClass = prompt('Kemaskini Kelas:', m.kelas);
                                   if (newName !== null && newClass !== null) {
                                     const updated = [...muridList];
                                     updated[i] = { nama: newName.trim(), kelas: newClass.trim() };
                                     updateAdminData('murid', updated);
                                   }
                                 }}
                                 className="text-slate-500 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 p-1.5 rounded transition-colors"
                               >
                                 <Edit size={14} />
                               </button>
                               <button 
                                 onClick={() => {
                                   if(confirm(`Buang ${m.nama}?`)){
                                     const updated = muridList.filter((_, index) => index !== i);
                                     updateAdminData('murid', updated);
                                   }
                                 }}
                                 className="text-slate-500 hover:text-red-600 bg-slate-50 hover:bg-red-50 p-1.5 rounded transition-colors"
                               >
                                 <Trash2 size={14} />
                               </button>
                             </div>
                           </div>
                         ))}
                       </div>
                     </div>
                   )}
                 </div>

              </div>
           </div>
        </div>
      )}

      {/* Record Tab */}
      {activeTab === 'rekod' && (
        <div className="flex-1 w-full max-w-4xl mx-auto p-4 md:p-6 mt-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
            <div className="bg-slate-50 border-b border-slate-200 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Archive size={18} className="text-blue-600" />
                <h2 className="font-bold text-slate-800 tracking-tight">Rekod Pengisian Guru</h2>
              </div>
            </div>
            <div className="p-0">
              {rekodList.length === 0 ? (
                <div className="text-center py-16 px-4">
                  <div className="bg-slate-100 text-slate-400 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <ClipboardList size={32} />
                  </div>
                  <h3 className="font-bold text-slate-800 mb-1">Tiada Rekod Pengisian</h3>
                  <p className="text-sm text-slate-500 max-w-sm mx-auto">Anda belum menyimpan sebarang borang. Sila isi maklumat di Borang Utama dan tekan "Simpan Borang".</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {rekodList.map((rekod) => (
                    <div key={rekod.id} className={`p-5 md:p-6 transition-colors flex flex-col md:flex-row gap-4 justify-between border-b last:border-b-0 ${getSubjectColor(rekod.info.mataPelajaran)}`}>
                      <div className="space-y-3 flex-1">
                        <div className="flex items-center gap-3">
                          <h4 className="font-bold text-slate-800 border-b-2 border-slate-800/20 pb-0.5">{rekod.info.mataPelajaran || 'Mata Pelajaran Tidak Ditetapkan'}</h4>
                          <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded-md flex items-center gap-1">
                            <Clock size={12}/>
                            {new Date(rekod.timestamp).toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute:'2-digit' })}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-slate-600">
                          <div className="flex items-center gap-1.5"><User size={14} className="text-slate-400"/> Pentaksir: <span className="text-slate-800">{rekod.info.namaPentaksir || '-'}</span></div>
                          <div className="flex items-center gap-1.5"><Hash size={14} className="text-slate-400"/> Sekolah: <span className="text-slate-800">{rekod.info.sekolah || '-'}</span></div>
                          <div className="flex items-center gap-1.5"><Users size={14} className="text-slate-400"/> Calon: <span className="text-slate-800">{rekod.muridCount} Murid</span></div>
                        </div>
                      </div>
                      <div className="flex flex-row md:flex-col gap-2 shrink-0">
                         <button 
                           onClick={async () => {
                             handleEditRekod(rekod);
                             // Let state settle, then generate
                             setTimeout(() => generatePDF(), 500);
                           }}
                           className="flex-1 md:flex-none border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 rounded-lg font-bold text-xs text-slate-700 flex items-center justify-center gap-2 transition-colors"
                         >
                           <FileDown size={14}/> Muat Turun PDF
                         </button>
                         <div className="flex gap-2 flex-1 md:flex-none">
                           <button 
                             onClick={() => handleEditRekod(rekod)}
                             className="flex-1 border border-blue-200 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg font-bold text-xs text-blue-700 flex items-center justify-center gap-2 transition-colors"
                           >
                             <Edit size={14}/> Kemaskini
                           </button>
                           <button 
                             onClick={() => handleDeleteRekod(rekod.id)}
                             className="flex-1 border border-red-200 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-lg font-bold text-xs text-red-600 flex items-center justify-center gap-2 transition-colors"
                           >
                             <Trash2 size={14}/> Padam
                           </button>
                         </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {rekodList.length > 0 && (
              <div className="bg-slate-50 border-t border-slate-200 p-4 text-center">
                 <p className="text-[11px] font-medium text-slate-500">
                   Sistem menyimpan data di peranti semasa sahaja. Jika bertukar peranti, muat turun rekod anda terlebih dahulu.
                 </p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'borang' && (
        <div className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6 space-y-4 md:space-y-6 mt-2">
           
           {/* Custom Logo Display Check */}
           {customLogo && (
             <div className="flex justify-center mb-6 mt-2">
                 <img src={customLogo} alt="Logo KPM" className="h-16 md:h-20 object-contain drop-shadow-sm" />
             </div>
           )}

           {/* Maklumat Asas */}
           <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-5 py-4 flex items-center gap-2">
                <Info size={18} className="text-blue-600" />
                <h2 className="font-bold text-slate-800 tracking-tight">Maklumat Asas</h2>
              </div>
              <div className="p-5 md:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                 <div className="space-y-1.5">
                   <label className="text-[11px] font-bold text-slate-500 pl-1 uppercase tracking-wide">Nama Pentaksir</label>
                   <input 
                     list="senarai-guru"
                     type="text" name="namaPentaksir" value={info.namaPentaksir} onChange={handleInfo}
                     className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 md:p-3.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                     placeholder="- Sila Pilih atau Taip -"
                   />
                 </div>
                 <div className="space-y-1.5">
                   <label className="text-[11px] font-bold text-slate-500 pl-1 uppercase tracking-wide">Nama Guru</label>
                   <input 
                     list="senarai-guru"
                     type="text" name="namaGuru" value={info.namaGuru} onChange={handleInfo}
                     className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 md:p-3.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                     placeholder="- Sila Pilih atau Taip -"
                   />
                 </div>
                 <div className="space-y-1.5 lg:col-span-1">
                   <label className="text-[11px] font-bold text-slate-500 pl-1 uppercase tracking-wide">Sekolah</label>
                   <input 
                     type="text" name="sekolah" value={info.sekolah} onChange={handleInfo}
                     className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 md:p-3.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all font-semibold text-slate-700"
                   />
                 </div>
                 <div className="space-y-1.5 md:col-span-2 lg:col-span-2">
                   <label className="text-[11px] font-bold text-slate-500 pl-1 uppercase tracking-wide">Mata Pelajaran</label>
                   {subjekList.length > 0 ? (
                     <select 
                       name="mataPelajaran" value={info.mataPelajaran} onChange={handleInfo}
                       className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 md:p-3.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all font-semibold text-slate-700 cursor-pointer appearance-none"
                     >
                       <option value="">- Sila Pilih Mata Pelajaran -</option>
                       {subjekList.map((s, i) => (
                         <option key={i} value={s}>{s}</option>
                       ))}
                     </select>
                   ) : (
                     <input 
                       list="senarai-subjek"
                       type="text" name="mataPelajaran" value={info.mataPelajaran} onChange={handleInfo}
                       className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 md:p-3.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all font-semibold text-slate-700"
                       placeholder="- Sila Pilih atau Taip -"
                     />
                   )}
                 </div>
                 <div className="space-y-1.5 md:col-span-1 border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-100">
                   <label className="text-[11px] font-bold text-slate-500 pl-1 uppercase tracking-wide">Tarikh</label>
                   <input 
                     type="date" name="tarikh" value={info.tarikh} onChange={handleInfo}
                     className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 md:p-3.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                   />
                 </div>
                 <div className="space-y-1.5 md:col-span-1 lg:col-span-1 border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-100">
                   <label className="text-[11px] font-bold text-slate-500 pl-1 uppercase tracking-wide">Nama Pengetua/Guru Besar</label>
                   <input 
                     type="text" name="guruBesar" value={info.guruBesar} onChange={handleInfo}
                     className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 md:p-3.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all font-semibold text-slate-700"
                   />
                 </div>
              </div>
           </div>

           <div className="flex items-center justify-between pt-4 px-2">
             <div className="flex items-center gap-2">
               <User size={22} className="text-slate-600" />
               <h2 className="font-bold text-slate-800 text-lg md:text-xl">Markah Calon</h2>
             </div>
             
             <div className="flex gap-2">
               <button 
                 onClick={() => setShowManageModal(true)}
                 className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 md:px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
               >
                 <Users size={16} /> <span className="hidden md:inline">Urus Senarai Bebas</span>
               </button>
               <button 
                  onClick={addSingleRow} 
                  className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 md:px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
               >
                 <Plus size={16} /> Tambah Baris
               </button>
             </div>
           </div>
           
           {/* UNIFIED TABLE VIEW FOR ALL DEVICES */}
           <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
             <div className="overflow-x-auto">
               <table className="w-full text-sm text-left whitespace-nowrap md:whitespace-normal min-w-[900px]">
                 <thead className="bg-slate-800 text-white uppercase text-[10px] tracking-wider">
                   <tr>
                     <th className="px-4 py-4 text-center border-r border-slate-700 w-16">Bil</th>
                     <th className="px-4 py-4 border-r border-slate-700">Calon</th>
                     <th className="px-2 py-4 text-center border-r border-slate-700 w-24">Skor GMP</th>
                     <th className="px-2 py-4 text-center border-r border-slate-700 w-24">Skor KP</th>
                     <th className="px-2 py-4 text-center border-r border-slate-700 w-28 leading-tight">Peratus<br/>Beza Skor</th>
                     <th className="px-2 py-4 text-center border-r border-slate-700 w-32 leading-tight">Akur Panduan<br/>Penskoran</th>
                     <th className="px-2 py-4 text-center border-r border-slate-700 w-32 leading-tight">Tidak Akur<br/>Panduan</th>
                     <th className="px-2 py-4 text-center w-32 leading-tight">Kesilapan<br/>Menjumlah</th>
                     <th className="px-2 py-4 text-center w-12"></th>
                   </tr>
                 </thead>
                 <tbody>
                   {rows.map((row, index) => (
                     <tr key={index} className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
                       <td className="px-4 py-3 text-center font-bold text-slate-500 border-r border-slate-200 bg-slate-50">
                         {row.bil}
                       </td>
                       <td className="p-0 border-r border-slate-200 h-full relative">
                         <input 
                           list="senarai-calon"
                           placeholder="- Taip atau Pilih Nama Calon -"
                           className="w-full h-full min-h-[50px] px-4 min-w-[200px] outline-none focus:ring-inset focus:ring-2 focus:ring-blue-500 bg-transparent font-medium"
                           value={row.calon} 
                           onChange={(e) => {
                             const updated = [...rows];
                             updated[index].calon = e.target.value.toUpperCase();
                             setRows(updated);
                           }}
                         />
                       </td>
                       <td className="p-0 border-r border-slate-200">
                         <input 
                           type="number" 
                           className="w-full h-full min-h-[50px] p-4 text-center outline-none focus:ring-inset focus:ring-2 focus:ring-blue-500 bg-transparent font-semibold"
                           value={row.skorGMP} 
                           onChange={(e) => handleScore(index, 'skorGMP', e.target.value)} 
                         />
                       </td>
                       <td className="p-0 border-r border-slate-200">
                         <input 
                           type="number" 
                           className="w-full h-full min-h-[50px] p-4 text-center outline-none focus:ring-inset focus:ring-2 focus:ring-blue-500 bg-transparent font-semibold"
                           value={row.skorKP} 
                           onChange={(e) => handleScore(index, 'skorKP', e.target.value)} 
                         />
                       </td>
                       <td className="px-4 py-3 text-center font-bold text-blue-600 border-r border-slate-200 bg-blue-50/50">
                         {row.beza || ''}
                       </td>
                       
                       <td className="px-4 py-3 border-r border-slate-200 cursor-pointer hover:bg-slate-100" onClick={() => handleRadio(index, 'akur')}>
                         <div className={`w-6 h-6 mx-auto rounded-full border-2 flex items-center justify-center transition-all ${row.akur ? 'border-green-500 bg-green-500' : 'border-slate-300'}`}>
                           {row.akur && <div className="w-2.5 h-2.5 bg-white rounded-full"></div>}
                         </div>
                       </td>
                       <td className="px-4 py-3 border-r border-slate-200 cursor-pointer hover:bg-slate-100" onClick={() => handleRadio(index, 'tidakAkur')}>
                         <div className={`w-6 h-6 mx-auto rounded-full border-2 flex items-center justify-center transition-all ${row.tidakAkur ? 'border-orange-500 bg-orange-500' : 'border-slate-300'}`}>
                           {row.tidakAkur && <div className="w-2.5 h-2.5 bg-white rounded-full"></div>}
                         </div>
                       </td>
                       <td className="px-4 py-3 border-r border-slate-200 cursor-pointer hover:bg-slate-100" onClick={() => handleCheck(index)}>
                         <div className={`w-6 h-6 mx-auto rounded border-2 flex items-center justify-center transition-all ${row.kesilapan ? 'border-red-500 bg-red-500' : 'border-slate-300'}`}>
                           {row.kesilapan && <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-white stroke-[3] stroke-current"><polyline points="20 6 9 17 4 12" /></svg>}
                         </div>
                       </td>
                       <td className="p-2 text-center">
                         <button 
                           onClick={() => {
                              const updated = [...rows];
                              updated.splice(index, 1);
                              updated.forEach((r, i) => r.bil = i + 1);
                              setRows(updated);
                           }}
                           className="text-red-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors"
                         >
                           <Trash2 size={16} />
                         </button>
                       </td>
                     </tr>
                   ))}
                   
                   {/* Table Footer - Totals & Percentages */}
                   <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold">
                     <td colSpan={2} className="px-4 py-3 text-right uppercase tracking-wider text-xs border-r border-slate-200">Jumlah</td>
                     <td className="px-4 py-3 border-r border-slate-200 bg-slate-200/50"></td>
                     <td className="px-4 py-3 border-r border-slate-200 bg-slate-200/50"></td>
                     <td className="px-4 py-3 border-r border-slate-200 bg-slate-200/50"></td>
                     <td className="px-4 py-3 text-center border-r border-slate-200 text-green-700 text-base">{rows.filter(r => r.akur).length}</td>
                     <td className="px-4 py-3 text-center border-r border-slate-200 text-orange-700 text-base">{rows.filter(r => r.tidakAkur).length}</td>
                     <td className="px-4 py-3 text-center border-r border-slate-200 text-red-700 text-base">{rows.filter(r => r.kesilapan).length}</td>
                     <td></td>
                   </tr>
                   <tr className="bg-slate-100 border-t border-slate-300 font-bold">
                     <td colSpan={2} className="px-4 py-3 text-right uppercase tracking-wider text-xs border-r border-slate-200">Peratus</td>
                     <td className="px-4 py-3 border-r border-slate-200 bg-slate-200/50"></td>
                     <td className="px-4 py-3 border-r border-slate-200 bg-slate-200/50"></td>
                     <td className="px-4 py-3 border-r border-slate-200 bg-slate-200/50"></td>
                     <td className="px-4 py-3 text-center border-r border-slate-200 text-green-700 text-base">
                       {rows.filter(r => r.akur || r.tidakAkur).length > 0 ? (rows.filter(r => r.akur).length / rows.filter(r => r.akur || r.tidakAkur).length * 100).toFixed(0) + '%' : '0%'}
                     </td>
                     <td className="px-4 py-3 text-center border-r border-slate-200 text-orange-700 text-base">
                       {rows.filter(r => r.akur || r.tidakAkur).length > 0 ? (rows.filter(r => r.tidakAkur).length / rows.filter(r => r.akur || r.tidakAkur).length * 100).toFixed(0) + '%' : '0%'}
                     </td>
                     <td className="px-4 py-3 text-center border-r border-slate-200 text-red-700 text-base">
                       {rows.filter(r => r.akur || r.tidakAkur).length > 0 ? (rows.filter(r => r.kesilapan).length / rows.filter(r => r.akur || r.tidakAkur).length * 100).toFixed(0) + '%' : '0%'}
                     </td>
                     <td></td>
                   </tr>
                 </tbody>
               </table>
             </div>
           </div>

           {/* Catatan Pentaksir Section (Moved below table) */}
           <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mt-6 p-5 md:p-6 mb-20">
             <h3 className="font-bold text-sm text-slate-800 mb-4">CATATAN PENTAKSIR :</h3>
             <div className="flex flex-col gap-3 text-sm text-slate-700">
               <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
                 <div className="whitespace-nowrap font-medium w-64 md:w-auto">1. GMP</div>
                 <select name="catatanPMP" value={info.catatanPMP} onChange={handleInfo} className="w-40 bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 cursor-pointer outline-none font-bold">
                   <option value="">- Sila Pilih -</option>
                   <option value="PERLU">PERLU</option>
                   <option value="TIDAK PERLU">TIDAK PERLU</option>
                 </select>
                 <div>membuat penskoran semula <strong>SEMUA</strong> SJC UASA di bawah tanggungjawabnya.</div>
               </div>
               
               <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
                 <div className="whitespace-nowrap font-medium w-64 md:w-auto">2. Ketua Pentaksir Mata Pelajaran (KPMP)</div>
                 <select name="catatanKP" value={info.catatanKP} onChange={handleInfo} className="w-40 bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 cursor-pointer outline-none font-bold">
                   <option value="">- Sila Pilih -</option>
                   <option value="PERLU">PERLU</option>
                   <option value="TIDAK PERLU">TIDAK PERLU</option>
                 </select>
                 <div>menjalankan semula Moderasi Penskoran SJC UASA bagi skrip yang dibuat penskoran semula.</div>
               </div>

               <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
                 <div className="whitespace-nowrap font-medium w-64 md:w-auto">3. Skor</div>
                 <select name="catatanSkor" value={info.catatanSkor} onChange={handleInfo} className="w-40 bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 cursor-pointer outline-none font-bold">
                   <option value="">- Sila Pilih -</option>
                   <option value="BOLEH">BOLEH</option>
                   <option value="TIDAK BOLEH">TIDAK BOLEH</option>
                 </select>
                 <div>dihantar ke Lembaga Peperiksaan.</div>
               </div>

               <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 mt-1">
                 <div className="font-medium">4. Menyerahkan sesalinan kepada sekolah.</div>
               </div>

               <div className="mt-12 md:mt-16 flex flex-col md:flex-row justify-between pt-8 border-t border-slate-100 gap-16 md:gap-8 px-2 md:px-8">
                 <div className="flex flex-col items-center w-full md:w-64">
                   <div className="font-bold text-slate-800 text-left w-full mb-16 uppercase">Tandatangan :</div>
                   <div className="border-b-2 border-slate-800 w-full mb-2"></div>
                   <div className="font-bold text-slate-700 uppercase tracking-wide text-center uppercase">
                     {info.namaPentaksir || 'PENTAKSIR'}
                   </div>
                 </div>
                 <div className="flex flex-col items-center w-full md:w-64">
                   <div className="font-bold text-slate-800 text-left w-full mb-16 uppercase">Pengesahan Pengetua/Guru Besar:</div>
                   <div className="border-b-2 border-slate-800 w-full mb-2"></div>
                   <div className="font-bold text-slate-700 uppercase tracking-wide text-center uppercase">
                     {info.guruBesar || 'PENGETUA / GURU BESAR'}
                   </div>
                 </div>
               </div>
             </div>
           </div>
        </div>
      )}

      {/* Fixed Bottom Action Bar (Only on Borang Tab) */}
      {activeTab === 'borang' && (
        <div className="fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-sm border-t border-slate-200 p-4 shadow-[0_-15px_30px_-5px_rgba(0,0,0,0.1)] z-40">
            <div className="max-w-7xl mx-auto flex justify-between items-center w-full px-2">
              <div className="flex flex-col">
                 <span className="text-[10px] md:text-xs text-slate-500 uppercase tracking-widest font-bold">Telah Dinilai</span>
                 <span className="text-sm md:text-lg font-extrabold text-slate-800 flex items-center gap-1">
                   {rows.filter(r => r.akur || r.tidakAkur).length} / {rows.length} Calon
                 </span>
              </div>
              
              <div className="flex gap-2 text-sm md:text-base flex-wrap justify-end">
                <button 
                  onClick={handleExportToGoogleSheet}
                  disabled={isSyncingSheet}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 md:px-5 py-3 md:py-3.5 rounded-xl font-bold shadow-lg shadow-emerald-600/30 transition-all active:scale-95 flex items-center gap-2"
                >
                   {isSyncingSheet ? <Cloud className="animate-pulse" size={18} /> : <Cloud size={18} />}
                   {isSyncingSheet ? 'Menyambung...' : 'Hantar K.Sheet'}
                </button>
                <button 
                  onClick={handleSimpanBorangUtama} 
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 md:px-6 py-3 md:py-3.5 rounded-xl font-bold shadow-lg shadow-blue-600/30 transition-all active:scale-95 flex items-center gap-2"
                >
                   <Save size={18} className="hidden md:block" />
                   Simpan Borang
                </button>
                <button 
                  onClick={generatePDF} 
                  disabled={isGenerating}
                  className={`${isGenerating ? 'bg-green-600' : 'bg-green-600 hover:bg-green-700'} text-white px-4 md:px-6 py-3 md:py-3.5 rounded-xl font-bold shadow-lg shadow-green-600/30 transition-all active:scale-95 flex items-center gap-2`}
                >
                   <FileText size={18} className="hidden md:block" />
                   {isGenerating ? 'Menjana...' : 'Muat Turun (PDF)'} 
                   {!isGenerating && <ChevronRight size={18} className="md:hidden" />}
                </button>
              </div>
            </div>
        </div>
      )}

      {/* Urus Senarai Murid Modal */}
      {showManageModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="bg-slate-50 border-b border-slate-200 p-5 flex items-center justify-between shadow-sm">
               <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                 <Users size={20} className="text-blue-600" /> Urus Senarai Calon
               </h2>
               <button onClick={() => setShowManageModal(false)} className="bg-slate-200 hover:bg-slate-300 p-1.5 rounded-full text-slate-600 transition-colors">
                 <X size={18}/>
               </button>
            </div>
            
            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Tampal Nama Calon (Satu baris untuk satu nama)</label>
                <textarea 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none min-h-[160px] font-medium resize-none shadow-inner"
                  placeholder="Ali bin Abu&#10;Siti binti Ahmad&#10;Chong Wei..."
                  value={pasteNames}
                  onChange={(e) => setPasteNames(e.target.value)}
                />
              </div>
              
              <button 
                onClick={applyPastedNames}
                disabled={pasteNames.trim().length === 0}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white p-3.5 rounded-xl font-bold shadow-md transition-colors"
              >
                Ganti Senarai Murid
              </button>
              
              <div className="h-px bg-slate-200 w-full my-2"></div>
              
              <button 
                onClick={clearData}
                className="w-full bg-red-50 hover:bg-red-100 text-red-600 p-3.5 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 size={18} /> Padam Semua Data & Jadual
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
