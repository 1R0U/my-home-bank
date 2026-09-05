import { Stack, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Alert, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DEV_ROLE_OVERRIDE } from "../lib/devRole";
import { createStoreItemRequest } from "../lib/storeItemRequestService";
import { validateStoreItemRequest } from "../lib/storeItemRequestValidation";
import { useCurrentUser } from "../store";
import ScreenHeader from "./ScreenHeader";

export default function StoreItemRequestScreen() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const isLive = !DEV_ROLE_OVERRIDE && currentUser !== null;
  const isChildRole = currentUser?.role === "child";

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSubmit = isLive && isChildRole && !isSubmitting;

  const handlePickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setErrorMessage("写真ライブラリへのアクセスが許可されていません。");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.7,
      });
      if (result.canceled) return;

      setErrorMessage(null);
      setImageUri(result.assets[0].uri);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "画像の選択に失敗しました");
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit || !currentUser || !isChildRole) return;

    const validationError = validateStoreItemRequest({ description, imageUri, reason, title });
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await createStoreItemRequest({
        description: description.trim(),
        image_url: imageUri as string,
        reason: reason.trim(),
        requested_by: currentUser.id,
        title: title.trim(),
      });
      Alert.alert("申請を送信しました", "親が確認できるように申請を保存しました。", [
        { onPress: () => router.back(), text: "OK" },
      ]);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "商品追加の申請に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!currentUser) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-100" edges={["top", "bottom"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text className="text-sm text-slate-400">ログインしてください</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScreenHeader title="商品追加申請" />

      <ScrollView contentContainerClassName="px-6 pb-10" showsVerticalScrollIndicator={false}>
        <Text className="mt-2 text-xs font-semibold text-slate-400">商品画像</Text>
        <Pressable
          accessibilityLabel={imageUri ? "商品画像を選び直す" : "商品画像を選択"}
          accessibilityRole="button"
          className="mt-1 h-40 items-center justify-center overflow-hidden rounded-2xl bg-white"
          onPress={handlePickImage}
        >
          {imageUri ? (
            <Image
              accessibilityIgnoresInvertColors
              resizeMode="cover"
              source={{ uri: imageUri }}
              style={{ height: "100%", width: "100%" }}
            />
          ) : (
            <Text className="text-sm text-slate-400">タップして画像を選択</Text>
          )}
        </Pressable>

        <Text className="mt-4 text-xs font-semibold text-slate-400">商品名</Text>
        <TextInput
          accessibilityLabel="商品名"
          className="mt-1 rounded-xl bg-white px-4 py-3 text-sm text-slate-900"
          onChangeText={setTitle}
          placeholder="商品名を入力"
          placeholderTextColor="#94a3b8"
          value={title}
        />

        <Text className="mt-4 text-xs font-semibold text-slate-400">商品の詳細</Text>
        <TextInput
          accessibilityLabel="商品の詳細"
          className="mt-1 rounded-xl bg-white px-4 py-3 text-sm text-slate-900"
          multiline
          numberOfLines={3}
          onChangeText={setDescription}
          placeholder="どんな商品か入力"
          placeholderTextColor="#94a3b8"
          style={{ minHeight: 72, textAlignVertical: "top" }}
          value={description}
        />

        <Text className="mt-4 text-xs font-semibold text-slate-400">欲しい理由</Text>
        <TextInput
          accessibilityLabel="欲しい理由"
          className="mt-1 rounded-xl bg-white px-4 py-3 text-sm text-slate-900"
          multiline
          numberOfLines={3}
          onChangeText={setReason}
          placeholder="欲しい理由を入力"
          placeholderTextColor="#94a3b8"
          style={{ minHeight: 72, textAlignVertical: "top" }}
          value={reason}
        />

        <Pressable
          accessibilityLabel="申請する"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
          className={`mt-6 items-center rounded-xl py-3 ${canSubmit ? "bg-slate-900 active:bg-slate-700" : "bg-slate-200"}`}
          disabled={!canSubmit}
          onPress={handleSubmit}
        >
          <Text className={`text-sm font-bold ${canSubmit ? "text-white" : "text-slate-400"}`}>申請する</Text>
        </Pressable>

        {errorMessage ? (
          <Text className="mt-2 text-center text-xs text-rose-500">{errorMessage}</Text>
        ) : !isLive ? (
          <Text className="mt-2 text-center text-xs text-slate-300">
            ※ プレビュー中はボタンを操作できません
          </Text>
        ) : !isChildRole ? (
          <Text className="mt-2 text-center text-xs text-slate-300">
            ※ 商品追加の申請は子供用アカウントのみ利用できます
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
