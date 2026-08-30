import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { ProgramliFaaliyet } from '../types/erp';

export type ProgramliSaveSource = 'ui' | 'sync' | 'background';

export const saveProgramliFaaliyetSafe = async (faaliyet: ProgramliFaaliyet, source: ProgramliSaveSource = 'ui') => {
  try {
    const docRef = doc(db, 'programliFaaliyetler', faaliyet.id);
    await setDoc(docRef, faaliyet);
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
};

export const deleteProgramliFaaliyetSafe = async (id: string, source: ProgramliSaveSource = 'ui') => {
  try {
    const docRef = doc(db, 'programliFaaliyetler', id);
    await deleteDoc(docRef);
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
};
