import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MOCK_STORE_ITEMS, MOCK_USERS } from "../constants/mockData";
import AdultBottomNav from "./nav/AdultBottomNav";
import ScreenHeader from "./ScreenHeader";

type StoreTab = "list" | "manage";

function getRequesterName(userId: string) {
  return MOCK_USERS.find((user) => user.id === userId)?.name ?? "不明";
}

type StoreTabButtonProps = {
  active: boolean;
  label: string;
  onPress: () => void;
};

function StoreTabButton({ active, label, onPress }: StoreTabButtonProps) {
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

function StoreItemList() {
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  return (
    <View className="overflow-hidden rounded-b-2xl rounded-tr-2xl bg-white">
      {MOCK_STORE_ITEMS.map((item, index) => {
        const expanded = expandedItemId === item.id;

        return (
          <Pressable
            accessibilityLabel={`${item.title}、${item.price}pt、依頼人 ${getRequesterName(item.requested_by)}`}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            className={`px-4 py-3 ${index !== MOCK_STORE_ITEMS.length - 1 ? "border-b border-slate-100" : ""}`}
            key={item.id}
            onPress={() => setExpandedItemId(expanded ? null : item.id)}
          >
            <View className="flex-row items-center gap-3">
              <Image className="h-12 w-12 rounded-lg bg-slate-200" source={{ uri: item.image_url }} />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-slate-900">{item.title}</Text>
                <Text className="mt-0.5 text-xs text-slate-400">依頼人: {getRequesterName(item.requested_by)}</Text>
              </View>
              <Text className="text-sm font-bold text-blue-600">{item.price}pt</Text>
            </View>

            {expanded && (
              <View className="mt-3 rounded-xl bg-slate-50 px-3 py-3">
                <Text className="text-xs font-semibold text-slate-400">詳細</Text>
                <Text className="mt-1 text-sm text-slate-700">{item.description}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function StoreItemManageForm() {
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [detail, setDetail] = useState("");

  return (
    <View className="gap-4 rounded-b-2xl rounded-tr-2xl bg-white p-4">
      <View>
        <Text className="text-xs font-semibold text-slate-400">題名</Text>
        <TextInput
          accessibilityLabel="題名"
          className="mt-1 border-b border-slate-200 pb-2 text-base text-slate-900"
          onChangeText={setTitle}
          placeholder="アイテム名を入力"
          value={title}
        />
      </View>

      <View>
        <Text className="text-xs font-semibold text-slate-400">Pt</Text>
        <TextInput
          accessibilityLabel="Pt"
          className="mt-1 border-b border-slate-200 pb-2 text-base text-slate-900"
          keyboardType="number-pad"
          onChangeText={setPrice}
          placeholder="必要ポイントを入力"
          value={price}
        />
      </View>

      <Pressable
        accessibilityLabel="画像を追加"
        accessibilityRole="button"
        className="flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-6"
      >
        <Ionicons color="#94a3b8" name="image-outline" size={20} />
        <Text className="text-sm font-medium text-slate-400">画像追加</Text>
      </Pressable>

      <View>
        <Text className="text-xs font-semibold text-slate-400">詳細</Text>
        <TextInput
          accessibilityLabel="詳細"
          className="mt-1 min-h-[80px] rounded-xl bg-slate-50 p-3 text-sm text-slate-900"
          multiline
          onChangeText={setDetail}
          placeholder="アイテムの説明を入力"
          textAlignVertical="top"
          value={detail}
        />
      </View>

      <Pressable
        accessibilityLabel="アイテムを追加"
        accessibilityRole="button"
        className="items-center rounded-full bg-blue-600 py-3 active:bg-blue-700"
      >
        <Text className="text-sm font-bold text-white">追加</Text>
      </Pressable>
    </View>
  );
}

export default function ParentStoreScreen() {
  const [tab, setTab] = useState<StoreTab>("list");

  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScreenHeader title="ストア" />

      <ScrollView contentContainerClassName="px-4 pb-10" showsVerticalScrollIndicator={false}>
        <View className="flex-row gap-2">
          <StoreTabButton active={tab === "list"} label="アイテム一覧" onPress={() => setTab("list")} />
          <StoreTabButton active={tab === "manage"} label="アイテム管理" onPress={() => setTab("manage")} />
        </View>

        {tab === "list" ? <StoreItemList /> : <StoreItemManageForm />}
      </ScrollView>

      <AdultBottomNav activeKey="store" />
    </SafeAreaView>
  );
}
