export type OutboxStatus = "PENDING" | "FAILED";

export type OutboxCommand = {
  id: string;
  key: string;
  type: "SALE_COMMIT";
  endpoint: string;
  payload: Record<string, unknown>;
  status: OutboxStatus;
  attempts: number;
  error?: string;
  createdAt: number;
};

const DB_NAME = "ledgerly-pos";
const STORE_NAME = "outbox";
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("OFFLINE_STORAGE_UNAVAILABLE"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("OFFLINE_STORAGE_UNAVAILABLE"));
  });
}

async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = run(database.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
    request.onsuccess = () => {
      database.close();
      resolve(request.result);
    };
    request.onerror = () => {
      database.close();
      reject(request.error ?? new Error("OFFLINE_STORAGE_ERROR"));
    };
  });
}

export function createCommand(payload: Record<string, unknown>): OutboxCommand {
  const key = typeof payload.idempotencyKey === "string" ? payload.idempotencyKey : crypto.randomUUID();
  return { id: key, key, type: "SALE_COMMIT", endpoint: "/api/v1/sales/commit", payload: { ...payload, idempotencyKey: key }, status: "PENDING", attempts: 0, createdAt: Date.now() };
}

export async function saveCommand(command: OutboxCommand): Promise<void> {
  await transaction("readwrite", (store) => store.put(command));
}

export async function listCommands(): Promise<OutboxCommand[]> {
  return (await transaction("readonly", (store) => store.getAll())) as OutboxCommand[];
}

export async function removeCommand(id: string): Promise<void> {
  await transaction("readwrite", (store) => store.delete(id));
}

export async function updateCommand(command: OutboxCommand): Promise<void> {
  await saveCommand(command);
}
