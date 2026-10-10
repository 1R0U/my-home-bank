import { Pressable, Text } from "react-native";

type FolderTabButtonProps = {
  active: boolean;
  label: string;
  onPress: () => void;
};

/**
 * 大人用画面の、カードの上に並ぶフォルダ風のタブ（Issue #399）。
 *
 * 選択中のタブは下の白いカードとつながって見えるよう、下の枠線を白にする。
 * 以前はストア画面と所持金画面に同じものが別名でコピーされていた。
 */
export default function FolderTabButton({ active, label, onPress }: FolderTabButtonProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={`flex-1 items-center rounded-t-xl border px-3 py-2 ${
        active ? "border-slate-200 border-b-white bg-white" : "border-transparent bg-slate-100"
      }`}
      onPress={onPress}
    >
      <Text className={`text-sm font-semibold ${active ? "text-slate-900" : "text-slate-400"}`}>{label}</Text>
    </Pressable>
  );
}
