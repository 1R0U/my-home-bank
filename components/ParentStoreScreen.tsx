import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getMockCurrentUser, MOCK_USERS } from "../constants/mockData";
import { parseAmountInput } from "../lib/bankUtils";
import { createStaleGuard } from "../lib/staleGuard";
import { createStoreItem, fetchFamilyUsers } from "../lib/storeService";
import { UNLIMITED_STOCK } from "../lib/storeUtils";
import { useStoreItemRequests } from "../lib/useStoreItemRequests";
import { useStoreItems } from "../lib/useStoreItems";
import { useCurrentUser } from "../store";
import type { StoreItem, StoreItemRequest } from "../types";
import KeyboardAvoidingScreen from "./KeyboardAvoidingScreen";
import AdultBottomNav from "./nav/AdultBottomNav";
import ScreenHeader from "./ScreenHeader";
import StoreItemRequestDetail from "./store/StoreItemRequestDetail";

type StoreTab = "list" | "manage" | "requests";

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

type StoreItemListProps = {
  items: StoreItem[];
  getRequesterName: (userId: string) => string;
  error: string | null;
  onRetry: () => void;
};

function StoreItemList({ items, getRequesterName, error, onRetry }: StoreItemListProps) {
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  if (error) {
    return (
      <View className="items-center gap-3 rounded-b-2xl rounded-tr-2xl bg-white px-4 py-6">
        <Text className="text-center text-sm text-rose-500">{error}</Text>
        <Pressable
          accessibilityLabel="アイテムの取得を再試行"
          accessibilityRole="button"
          className="rounded-full bg-slate-900 px-5 py-2 active:bg-slate-700"
          onPress={onRetry}
        >
          <Text className="text-sm font-semibold text-white">再試行</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="overflow-hidden rounded-b-2xl rounded-tr-2xl bg-white">
      {items.length === 0 ? (
        <Text className="px-4 py-6 text-center text-sm text-slate-400">アイテムがありません</Text>
      ) : (
        items.map((item, index) => {
          const expanded = expandedItemId === item.id;

          return (
            <Pressable
              accessibilityLabel={`${item.title}、${item.price}pt、依頼人 ${getRequesterName(item.requested_by)}`}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              className={`px-4 py-3 ${index !== items.length - 1 ? "border-b border-slate-100" : ""}`}
              key={item.id}
              onPress={() => setExpandedItemId(expanded ? null : item.id)}
            >
              <View className="flex-row items-center gap-3">
                {item.image_url ? (
                  <Image className="h-12 w-12 rounded-lg bg-slate-200" source={{ uri: item.image_url }} />
                ) : (
                  <View className="h-12 w-12 rounded-lg bg-slate-200" />
                )}
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-slate-900">{item.title}</Text>
                  <Text className="mt-0.5 text-xs text-slate-400">
                    依頼人: {getRequesterName(item.requested_by)} ・ 在庫:{" "}
                    {item.stock === UNLIMITED_STOCK ? "無制限" : item.stock}
                  </Text>
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
        })
      )}
    </View>
  );
}

type StoreItemRequestListProps = {
  requests: StoreItemRequest[];
  getRequesterName: (userId: string) => string;
  error: string | null;
  onRetry: () => void;
  approverId: string;
  isLive: boolean;
  onActionComplete: () => void;
};

function StoreItemRequestList({
  requests,
  getRequesterName,
  error,
  onRetry,
  approverId,
  isLive,
  onActionComplete,
}: StoreItemRequestListProps) {
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const pendingRequests = requests.filter((request) => request.status === "pending");
  const selectedRequest = pendingRequests.find((request) => request.id === selectedRequestId);

  if (error) {
    return (
      <View className="items-center gap-3 rounded-b-2xl rounded-tr-2xl bg-white px-4 py-6">
        <Text className="text-center text-sm text-rose-500">{error}</Text>
        <Pressable
          accessibilityLabel="申請の取得を再試行"
          accessibilityRole="button"
          className="rounded-full bg-slate-900 px-5 py-2 active:bg-slate-700"
          onPress={onRetry}
        >
          <Text className="text-sm font-semibold text-white">再試行</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <View className="overflow-hidden rounded-b-2xl rounded-tr-2xl bg-white">
        {pendingRequests.length === 0 ? (
          <Text className="px-4 py-6 text-center text-sm text-slate-400">承認待ちの申請はありません</Text>
        ) : (
          pendingRequests.map((request, index) => {
            const isSelected = request.id === selectedRequestId;

            return (
              <Pressable
                accessibilityHint="タップすると下に詳細が表示されます"
                accessibilityLabel={`${request.title}、申請者 ${getRequesterName(request.requested_by)}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                className={`flex-row items-center gap-3 px-4 py-3 ${
                  index !== pendingRequests.length - 1 ? "border-b border-slate-100" : ""
                } ${isSelected ? "bg-slate-50" : ""}`}
                key={request.id}
                onPress={() => setSelectedRequestId(isSelected ? null : request.id)}
              >
                {request.image_url ? (
                  <Image className="h-12 w-12 rounded-lg bg-slate-200" source={{ uri: request.image_url }} />
                ) : (
                  <View className="h-12 w-12 rounded-lg bg-slate-200" />
                )}
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-slate-900">{request.title}</Text>
                  <Text className="mt-0.5 text-xs text-slate-400">
                    申請者: {getRequesterName(request.requested_by)}
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}
      </View>

      {selectedRequest && (
        <StoreItemRequestDetail
          approverId={approverId}
          isLive={isLive}
          onActionComplete={() => {
            setSelectedRequestId(null);
            onActionComplete();
          }}
          onClose={() => setSelectedRequestId(null)}
          request={selectedRequest}
          requesterName={getRequesterName(selectedRequest.requested_by)}
        />
      )}
    </>
  );
}

type StoreItemManageFormProps = {
  requestedBy: string;
  isLive: boolean;
  onCreated: () => void;
};

function StoreItemManageForm({ requestedBy, isLive, onCreated }: StoreItemManageFormProps) {
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [detail, setDetail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 承認パス（StoreItemRequestDetail）や DB 側 approve_store_item_request の
  // p_price >= 1 と揃えるため、「1以上の整数」だけを受け付ける。
  const parsedPrice = parseAmountInput(price);
  const canSubmit =
    isLive && title.trim().length > 0 && parsedPrice !== null && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit || parsedPrice === null) return;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await createStoreItem({
        description: detail.trim(),
        price: parsedPrice,
        requested_by: requestedBy,
        // 画像アップロード機能は未実装のため無制限在庫のみサポートする。
        stock: UNLIMITED_STOCK,
        title: title.trim(),
      });
      setTitle("");
      setPrice("");
      setDetail("");
      onCreated();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "アイテムの追加に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

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
        accessibilityHint="画像アップロード機能は今後実装予定です"
        accessibilityLabel="画像を追加"
        accessibilityRole="button"
        className="flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-6 opacity-50"
        disabled
      >
        <Ionicons color="#94a3b8" name="image-outline" size={20} />
        <Text className="text-sm font-medium text-slate-400">画像追加（今後実装予定）</Text>
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
        accessibilityState={{ disabled: !canSubmit }}
        className={`items-center rounded-full py-3 ${canSubmit ? "bg-blue-600 active:bg-blue-700" : "bg-slate-200"}`}
        disabled={!canSubmit}
        onPress={handleSubmit}
      >
        <Text className={`text-sm font-bold ${canSubmit ? "text-white" : "text-slate-400"}`}>追加</Text>
      </Pressable>
      {errorMessage ? (
        <Text className="text-center text-[11px] text-rose-500">{errorMessage}</Text>
      ) : !isLive ? (
        <Text className="text-center text-[11px] text-slate-300">※ プレビュー中はボタンを操作できません</Text>
      ) : null}
    </View>
  );
}

export default function ParentStoreScreen() {
  const [tab, setTab] = useState<StoreTab>("list");
  const { items, isLive, reload, error } = useStoreItems();
  const {
    requests,
    isLive: requestsIsLive,
    reload: reloadRequests,
    error: requestsError,
  } = useStoreItemRequests();
  const loggedInUser = useCurrentUser();
  const currentUser = loggedInUser ?? getMockCurrentUser("parent");
  const pendingRequestCount = requests.filter((request) => request.status === "pending").length;

  // 依頼人名の解決用。ライブ接続中は実際の家族ユーザー一覧を取得する。
  const [liveUsers, setLiveUsers] = useState<{ id: string; name: string }[]>([]);
  // ユーザー切り替え時に、先に開始した取得が後から完了して新しい一覧を
  // 古い値で上書きしないよう、staleGuard で最新のリクエストのみ反映する
  // （useStoreItemRequests と同じ方針）。
  const familyUsersGuard = useRef(createStaleGuard());
  useEffect(() => {
    const requestId = familyUsersGuard.current.start();
    if (!isLive) {
      setLiveUsers([]);
      return;
    }
    fetchFamilyUsers()
      .then((users) => {
        if (familyUsersGuard.current.isCurrent(requestId)) setLiveUsers(users);
      })
      .catch(() => {
        if (familyUsersGuard.current.isCurrent(requestId)) setLiveUsers([]);
      });
    // ログアウトを挟まないユーザー切り替え（親A→親B など、どちらも isLive）でも
    // 家族ユーザー一覧を取り直せるよう、currentUser.id も依存に含める。
  }, [isLive, currentUser.id]);

  const getRequesterName = (userId: string) => {
    const source = isLive ? liveUsers : MOCK_USERS;
    return source.find((user) => user.id === userId)?.name ?? "不明";
  };

  const requestsTabLabel = pendingRequestCount > 0 ? `申請 (${pendingRequestCount})` : "申請";

  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScreenHeader title="ストア" />

      <KeyboardAvoidingScreen>
        <ScrollView className="flex-1" contentContainerClassName="px-4 pb-10" showsVerticalScrollIndicator={false}>
          <View className="flex-row gap-2">
            <StoreTabButton active={tab === "list"} label="アイテム一覧" onPress={() => setTab("list")} />
            <StoreTabButton active={tab === "manage"} label="アイテム管理" onPress={() => setTab("manage")} />
            <StoreTabButton active={tab === "requests"} label={requestsTabLabel} onPress={() => setTab("requests")} />
          </View>

          {tab === "list" ? (
            <StoreItemList error={error} getRequesterName={getRequesterName} items={items} onRetry={reload} />
          ) : tab === "manage" ? (
            <StoreItemManageForm isLive={isLive} onCreated={reload} requestedBy={currentUser.id} />
          ) : (
            <StoreItemRequestList
              approverId={currentUser.id}
              error={requestsError}
              getRequesterName={getRequesterName}
              isLive={requestsIsLive}
              onActionComplete={() => {
                reloadRequests();
                reload();
              }}
              onRetry={reloadRequests}
              requests={requests}
            />
          )}
        </ScrollView>

        <AdultBottomNav activeKey="store" />
      </KeyboardAvoidingScreen>
    </SafeAreaView>
  );
}
