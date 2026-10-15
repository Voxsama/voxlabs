import { EventEmitter } from "node:events";
import type { StudioEvent } from "./types";

const g = globalThis as unknown as { __studioBus?: EventEmitter };
const bus = g.__studioBus ?? (g.__studioBus = new EventEmitter());
bus.setMaxListeners(100);

export function emit(projectId: string, ev: StudioEvent) {
  bus.emit(`project:${projectId}`, ev);
}

export function subscribe(projectId: string, fn: (ev: StudioEvent) => void): () => void {
  const key = `project:${projectId}`;
  bus.on(key, fn);
  return () => bus.off(key, fn);
}
