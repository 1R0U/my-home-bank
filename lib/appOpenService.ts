import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClient } from "./supabaseClient.ts";

type Client = Pick<SupabaseClient, "rpc">;

/** 日本時間（UTC+9）のずれ（ミリ秒） */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 日付が変わったあと、記録し直すまでに置く余裕（ミリ秒）。
 * 端末の時計がDBより少し進んでいても、DBの時計で新しい日になってから記録するため。
 */
export const MIDNIGHT_MARGIN_MS = 5000;

/**
 * 次の日本時間 0:00 までの時間を求める（前面に出したまま日付をまたいだときに記録し直すきっかけ）。
 *
 * どの日として記録するかはDBの時計で決まるので、ここで求めるのは呼び直す時刻だけ。
 * @param nowMs - 今の時刻（ミリ秒）
 * @returns 次の日本時間 0:00 までのミリ秒。ちょうど 0:00 なら翌日の 0:00 まで（1日）
 */
export function msUntilNextJstMidnight(nowMs: number): number {
  const sinceMidnight = (((nowMs + JST_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS;
  return DAY_MS - sinceMidnight;
}

const recordedListeners = new Set<() => void>();

/**
 * アプリを開いた日の記録が終わったときに呼ばれる関数を登録する（Issue #355）。
 *
 * 掲示板を開いたままアプリを前面に戻したとき、記録の書き込みが終わってから連続記録を
 * 取り直すために使う（画面のフォーカスは変わらないので、フォーカス時の取り直しは走らない）。
 * すでに記録済みだったとき（別の端末で今日の分を先に記録したときなど）にも呼ばれる。
 * @param listener - 記録が終わったときに呼ぶ関数
 * @returns 登録を外す関数
 */
export function onAppOpenRecorded(listener: () => void): () => void {
  recordedListeners.add(listener);
  return () => {
    recordedListeners.delete(listener);
  };
}

/** アプリを開いた日の記録が終わったことを、登録された関数へ知らせる。 */
export function notifyAppOpenRecorded(): void {
  recordedListeners.forEach((listener) => listener());
}

/**
 * アプリを開いたことを記録する（大人の連続記録用。Issue #355）。
 *
 * 同じ日に何度呼んでも1日分にしかならない。子供が呼んでもDBは何もしない（false を返す）。
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 * @returns 今回あらたに記録したか
 */
export async function recordAppOpen(client?: Client): Promise<boolean> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient.rpc("record_app_open");
  if (error) throw error;
  return data === true;
}
