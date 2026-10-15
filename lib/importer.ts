import path from "node:path";
import AdmZip from "adm-zip";
import mammoth from "mammoth";
import { naturalCompare } from "./text";

export interface ImportedFile {
  name: string; // chapter name (file name without extension)
  text: string;
}

const TEXT_EXT = new Set([".txt", ".md", ".text"]);

export async function textFromFile(filename: string, data: Buffer): Promise<string | null> {
  const ext = path.extname(filename).toLowerCase();
  if (TEXT_EXT.has(ext)) return data.toString("utf8").replace(/^﻿/, "");
  if (ext === ".docx") {
    const { value } = await mammoth.extractRawText({ buffer: data });
    return value;
  }
  return null;
}

/** Expand uploaded files (txt/docx/zip) into chapter texts, naturally sorted by file name. */
export async function filesToChapters(files: { name: string; data: Buffer }[]): Promise<{ chapters: ImportedFile[]; skipped: string[] }> {
  const chapters: ImportedFile[] = [];
  const skipped: string[] = [];
  const addOne = async (name: string, data: Buffer) => {
    const text = await textFromFile(name, data);
    if (text == null) return skipped.push(name);
    chapters.push({ name: path.basename(name, path.extname(name)), text });
  };
  for (const f of files) {
    if (path.extname(f.name).toLowerCase() === ".zip") {
      const zip = new AdmZip(f.data);
      for (const e of zip.getEntries()) {
        const n = e.entryName.replace(/\\/g, "/");
        if (e.isDirectory || n.startsWith("__MACOSX/") || path.posix.basename(n).startsWith(".")) continue;
        await addOne(path.posix.basename(n), e.getData());
      }
    } else {
      await addOne(f.name, f.data);
    }
  }
  chapters.sort((a, b) => naturalCompare(a.name, b.name));
  return { chapters, skipped };
}
