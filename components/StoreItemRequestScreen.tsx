import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Alert, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { deleteStoreItemImage, MAX_STORE_ITEM_IMAGE_BYTES, uploadStoreItemImage } from "../lib/storeImageUpload";
import { createStoreItemRequest } from "../lib/storeItemRequestService";
import { validateStoreItemRequest } from "../lib/storeItemRequestValidation";
import { useSubmitGate } from "../lib/useSubmitGate";
import ChildBackButton, { goBackOrReplace } from "./ChildBackButton";
import { CHILD_THEME } from "./childTheme";
import Furigana from "./Furigana";
import KeyboardAvoidingScreen from "./KeyboardAvoidingScreen";
import SubmitGateNotice from "./SubmitGateNotice";
import { STORE_ITEM_REQUEST_COLORS, storeItemRequestStyles as styles } from "./store/storeItemRequestStyles";
import { storeStyles } from "./store/storeStyles";

/** 戻れる画面がないとき（Webでの再読み込み・ディープリンク）の移り先 */
const BACK_FALLBACK_HREF = "/store-child";

/**
 * 子供がストアに置いてほしい商品を申請する画面。
 * ストア画面と同じ、木の枠の中に金のふちの申請用紙を置いた見た目にしている（Issue #488）。
 *
 * 子供のロールで、かつIDがUUIDのときだけ送信できる。
 * モックアカウントで入った場合は「プレビュー中」としてボタンを無効にする（#174）。
 */
export default function StoreItemRequestScreen() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const gate = useSubmitGate("child", isSubmitting);
  const { currentUser } = gate;
  const canSubmit = gate.canSubmit && Boolean(currentUser?.family_id);

  const handlePickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setErrorMessage("{写真|しゃしん}ライブラリへのアクセスが{許可|きょか}されていません。");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.7,
      });
      if (result.canceled) return;

      // fileSizeが取得できない場合も拒否する。確認せずに進めると、大きな画像で
      // arrayBuffer()（lib/storeImageUpload.ts）がメモリを圧迫しうる（CodeRabbitレビュー指摘）。
      const asset = result.assets[0];
      if (!asset.fileSize || asset.fileSize > MAX_STORE_ITEM_IMAGE_BYTES) {
        setErrorMessage(
          "{画像|がぞう}のサイズを{確認|かくにん}できないか、{上限|じょうげん}（8MB）を{超|こ}えています。{別|べつ}の{画像|がぞう}を{選|えら}んでください。",
        );
        return;
      }

      setErrorMessage(null);
      setImageUri(asset.uri);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "{画像|がぞう}の{選択|せんたく}に{失敗|しっぱい}しました");
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit || !currentUser) return;

    const validationError = validateStoreItemRequest({ description, imageUri, reason, title });
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);
    // アップロード後にDB保存が失敗した場合、どの申請からも使われない画像が
    // バケットに残ってしまう（1R0Uさんレビュー指摘）。catchで後片付けできるよう
    // tryの外で宣言する。
    let imageUrl: string | undefined;
    try {
      // アップロードに失敗したら申請は保存しない。uploadStoreItemImage が投げた時点で
      // 下のcreateStoreItemRequestへ進まず、catchでエラー表示だけ行う。
      imageUrl = await uploadStoreItemImage(imageUri as string, currentUser.family_id as string);
      await createStoreItemRequest({
        description: description.trim(),
        family_id: currentUser.family_id as string,
        image_url: imageUrl,
        reason: reason.trim(),
        requested_by: currentUser.id,
        title: title.trim(),
      });
      // アラートにはふりがなを付けられないので、ひらがなで書く（Issue #347）
      Alert.alert("しんせいを そうしんしました", "おやが かくにんできるように しんせいを ほぞんしました。", [
        { onPress: () => goBackOrReplace(BACK_FALLBACK_HREF), text: "OK" },
      ]);
    } catch (e) {
      // 申請の保存（createStoreItemRequest）が失敗したときだけ、アップロード済みの
      // 画像を削除する。アップロード自体の失敗（imageUrlが未設定）では削除対象がない。
      // 削除自体に失敗しても、利用者には元のエラーを見せる。
      if (imageUrl) deleteStoreItemImage(imageUrl).catch(() => {});
      setErrorMessage(e instanceof Error ? e.message : "{商品|しょうひん}{追加|ついか}の{申請|しんせい}に{失敗|しっぱい}しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!currentUser) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={[storeStyles.safeArea, styles.loginContainer]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.loginText}>ログインしてください</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={storeStyles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* 入力欄がキーボードに隠れないよう、木の枠ごと縮める */}
      <KeyboardAvoidingScreen>
        <View style={storeStyles.header}>
          <View>
            <Text style={storeStyles.eyebrow}>アイテムショップ</Text>
            <Furigana noWrap accessibilityRole="header" style={storeStyles.screenTitle}>
              {"{商品|しょうひん}{追加|ついか}{申請|しんせい}"}
            </Furigana>
          </View>
        </View>

        <View style={storeStyles.shopFrame}>
          <View style={storeStyles.frameRivetLeft} />
          <View style={storeStyles.frameRivetRight} />
          <View style={storeStyles.shopContent}>
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.form}>
                <Furigana style={styles.fieldLabel}>{"{商品|しょうひん}{画像|がぞう}"}</Furigana>
                <Pressable
                  accessibilityLabel={imageUri ? "商品画像を選び直す" : "商品画像を選択"}
                  accessibilityRole="button"
                  onPress={handlePickImage}
                >
                  {/* 見た目は内側の View に付ける。Pressable の style を関数で渡すと、実機で背景・枠が付かなかった（#487） */}
                  {({ pressed }) => (
                    <View
                      style={[
                        styles.imagePicker,
                        imageUri && styles.imagePickerSelected,
                        pressed && styles.imagePickerPressed,
                      ]}
                    >
                      {imageUri ? (
                        <Image
                          accessibilityIgnoresInvertColors
                          resizeMode="cover"
                          source={{ uri: imageUri }}
                          style={styles.image}
                        />
                      ) : (
                        <>
                          <Ionicons color={CHILD_THEME.gold} name="image-outline" size={32} />
                          <Furigana style={styles.imagePickerText}>{"タップして{画像|がぞう}を{選択|せんたく}"}</Furigana>
                        </>
                      )}
                    </View>
                  )}
                </Pressable>

                <Furigana style={[styles.fieldLabel, styles.fieldLabelSpaced]}>{"{商品名|しょうひんめい}"}</Furigana>
                <TextInput
                  accessibilityLabel="商品名"
                  onChangeText={setTitle}
                  // 入力欄の見本にはふりがなを付けられないので、ひらがなで書く（Issue #347）
                  placeholder="しょうひんめいを にゅうりょく"
                  placeholderTextColor={STORE_ITEM_REQUEST_COLORS.placeholder}
                  style={styles.input}
                  value={title}
                />

                <Furigana style={[styles.fieldLabel, styles.fieldLabelSpaced]}>{"{商品|しょうひん}の{詳細|しょうさい}"}</Furigana>
                <TextInput
                  accessibilityLabel="商品の詳細"
                  multiline
                  numberOfLines={3}
                  onChangeText={setDescription}
                  placeholder="どんな しょうひんか にゅうりょく"
                  placeholderTextColor={STORE_ITEM_REQUEST_COLORS.placeholder}
                  style={[styles.input, styles.inputMultiline]}
                  value={description}
                />

                <Furigana style={[styles.fieldLabel, styles.fieldLabelSpaced]}>{"{欲|ほ}しい{理由|りゆう}"}</Furigana>
                <TextInput
                  accessibilityLabel="欲しい理由"
                  multiline
                  numberOfLines={3}
                  onChangeText={setReason}
                  placeholder="ほしい りゆうを にゅうりょく"
                  placeholderTextColor={STORE_ITEM_REQUEST_COLORS.placeholder}
                  style={[styles.input, styles.inputMultiline]}
                  value={reason}
                />

                <Pressable
                  accessibilityLabel="申請する"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canSubmit }}
                  disabled={!canSubmit}
                  onPress={handleSubmit}
                >
                  {({ pressed }) => (
                    <View
                      style={[
                        styles.submitButton,
                        !canSubmit && styles.submitButtonDisabled,
                        pressed && styles.submitButtonPressed,
                      ]}
                    >
                      <Furigana
                        noWrap
                        style={[styles.submitButtonText, !canSubmit && styles.submitButtonTextDisabled]}
                      >
                        {"{申請|しんせい}する"}
                      </Furigana>
                    </View>
                  )}
                </Pressable>

                <SubmitGateNotice
                  errorMessage={errorMessage}
                  featureName="商品追加の申請"
                  gate={gate}
                  textStyles={{ error: styles.errorNotice, notice: styles.notice }}
                />
              </View>
            </ScrollView>
          </View>
        </View>

        <View style={storeStyles.footer}>
          {/* 送信中に離れると、成功の「OK」でさらに前の画面へ戻ってしまうので押せなくする */}
          <ChildBackButton disabled={isSubmitting} fallbackHref={BACK_FALLBACK_HREF} />
        </View>
      </KeyboardAvoidingScreen>
    </SafeAreaView>
  );
}
