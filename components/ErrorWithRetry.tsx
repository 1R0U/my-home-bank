import { Pressable, Text, View } from "react-native";
import { ERROR_TEXT_CLASS } from "../constants/ui";

type ErrorWithRetryProps = {
  /** 画面に出すエラーの文言 */
  message: string;
  /** 読み上げ用のボタン名（例: 「アイテムの取得を再試行」） */
  retryLabel: string;
  onRetry: () => void;
  /** 外枠の className。置く場所に合わせて角丸などを変える */
  className?: string;
  /** 文字とボタンを小さくする（一覧の上に添える注記など） */
  compact?: boolean;
};

/**
 * 取得に失敗したことと、再試行ボタンを出す（Issue #399）。
 *
 * 以前は画面ごとにコピーされており、1か所だけ文字色が WCAG AA を満たさない
 * `text-rose-500` のまま残っていた（Issue #272 で直したはずの色）。
 * 文字色は `ERROR_TEXT_CLASS` に固定する。
 */
export default function ErrorWithRetry({ message, retryLabel, onRetry, className, compact = false }: ErrorWithRetryProps) {
  return (
    <View className={className ?? (compact ? "flex-row items-center justify-center gap-2" : "items-center gap-3 px-4 py-6")}>
      <Text className={`text-center ${compact ? "text-[11px]" : "text-sm"} ${ERROR_TEXT_CLASS}`}>{message}</Text>
      <Pressable
        accessibilityLabel={retryLabel}
        accessibilityRole="button"
        className={`rounded-full bg-slate-900 active:bg-slate-700 ${compact ? "px-3 py-1" : "px-5 py-2"}`}
        onPress={onRetry}
      >
        <Text className={`${compact ? "text-[11px]" : "text-sm"} font-semibold text-white`}>再試行</Text>
      </Pressable>
    </View>
  );
}
