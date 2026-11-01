import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { strToU8, zipSync } from 'fflate';
import { toMarkdownTree } from '../engine/vault';
import { getEngine } from './db';

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

async function share(file: File, mimeType: string, uti: string) {
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType, UTI: uti, dialogTitle: 'Sofia Cortex arşivi' });
}

export async function exportJSON(): Promise<void> {
  const f = new File(Paths.cache, `sofia-cortex-${stamp()}.json`);
  if (f.exists) f.delete();
  f.create();
  f.write(JSON.stringify(getEngine().exportJSON(), null, 2));
  await share(f, 'application/json', 'public.json');
}

export async function exportMarkdownZip(): Promise<void> {
  const e = getEngine();
  const tree = toMarkdownTree(e);
  const entries: Record<string, Uint8Array> = {};
  for (const [path, text] of Object.entries(tree)) entries[path] = strToU8(text);
  entries['Sofia Cortex/.cortex.json'] = strToU8(JSON.stringify(e.exportJSON()));
  const zip = zipSync(entries, { level: 6 });
  const f = new File(Paths.cache, `sofia-cortex-${stamp()}.zip`);
  if (f.exists) f.delete();
  f.create();
  f.write(zip);
  await share(f, 'application/zip', 'public.zip-archive');
}

export async function importJSON(mode: 'merge' | 'replace'): Promise<number | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'public.json', '*/*'], copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.[0]) return null;
  const text = await new File(res.assets[0].uri).text();
  return getEngine().importJSON(JSON.parse(text), mode);
}
