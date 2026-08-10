import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import type {
  KampFaaliyet,
  MermerciFaaliyet,
  OperatorSahaFaaliyet,
  SahaFaaliyeti,
  SoforSahaFaaliyet,
  TesisatciFaaliyet,
} from '../types/erp';
import { mermerciToSaha, operatorToSaha, soforToSaha, tesisatciToSaha } from './mobilFaaliyetAdapter';

/** Kamp/mobil faaliyet koleksiyonları — yalnızca ihtiyaç olduğunda dinlenir. */
export function useMobilFaaliyetSnapshots(enabled: boolean, sahaFaaliyetleri: SahaFaaliyeti[] = []) {
  const [kampFaaliyetleri, setKampFaaliyetleri] = useState<KampFaaliyet[]>([]);
  const [tesisatciFaaliyetleri, setTesisatciFaaliyetleri] = useState<TesisatciFaaliyet[]>([]);
  const [mermerciFaaliyetleri, setMermerciFaaliyetleri] = useState<MermerciFaaliyet[]>([]);
  const [soforSahaFaaliyetleri, setSoforSahaFaaliyetleri] = useState<SoforSahaFaaliyet[]>([]);
  const [operatorSahaFaaliyetleri, setOperatorSahaFaaliyetleri] = useState<OperatorSahaFaaliyet[]>([]);

  useEffect(() => {
    if (!enabled) return;
    const unsubs = [
      onSnapshot(collection(db, 'kampGunlukFaaliyetleri'), (snap) => {
        const list: KampFaaliyet[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<KampFaaliyet, 'id'>) }));
        setKampFaaliyetleri(list);
      }),
      onSnapshot(collection(db, 'tesisatciFaaliyetleri'), (snap) => {
        const list: TesisatciFaaliyet[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<TesisatciFaaliyet, 'id'>) }));
        setTesisatciFaaliyetleri(list);
      }),
      onSnapshot(collection(db, 'mermerciFaaliyetleri'), (snap) => {
        const list: MermerciFaaliyet[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<MermerciFaaliyet, 'id'>) }));
        setMermerciFaaliyetleri(list);
      }),
      onSnapshot(collection(db, 'soforSahaFaaliyetleri'), (snap) => {
        const list: SoforSahaFaaliyet[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<SoforSahaFaaliyet, 'id'>) }));
        setSoforSahaFaaliyetleri(list);
      }),
      onSnapshot(collection(db, 'operatorSahaFaaliyetleri'), (snap) => {
        const list: OperatorSahaFaaliyet[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<OperatorSahaFaaliyet, 'id'>) }));
        setOperatorSahaFaaliyetleri(list);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [enabled]);

  const tumSahaFaaliyetleri = useMemo(
    () => [
      ...sahaFaaliyetleri,
      ...(enabled ? tesisatciFaaliyetleri.map(tesisatciToSaha) : []),
      ...(enabled ? mermerciFaaliyetleri.map(mermerciToSaha) : []),
      ...(enabled ? soforSahaFaaliyetleri.map(soforToSaha) : []),
      ...(enabled
        ? operatorSahaFaaliyetleri
            .filter((f) => !String(f.durum || '').toLocaleUpperCase('tr-TR').includes('RED'))
            .map(operatorToSaha)
        : []),
    ],
    [
      enabled,
      sahaFaaliyetleri,
      tesisatciFaaliyetleri,
      mermerciFaaliyetleri,
      soforSahaFaaliyetleri,
      operatorSahaFaaliyetleri,
    ]
  );

  return { kampFaaliyetleri, tumSahaFaaliyetleri, faaliyetSnapshotsReady: enabled };
}
