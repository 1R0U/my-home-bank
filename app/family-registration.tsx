import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { useReducer, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { signUpWithEmail } from "../lib/auth";
import {
  canSubmitRegistration,
  familyRegistrationReducer,
  getPasswordInputState,
  INITIAL_FAMILY_REGISTRATION_STATE,
  REGISTRATION_ROLE_OPTIONS,
  type RegistrationRole,
} from "../lib/familyRegistration";
import { getEmailError, getNameError, getNewPasswordError } from "../lib/validation";

const roleIcons: Record<RegistrationRole, keyof typeof Ionicons.glyphMap> = {
  child: "happy-outline",
  parent: "people-outline",
};

export default function FamilyRegistrationScreen() {
  const [state, dispatch] = useReducer(
    familyRegistrationReducer,
    INITIAL_FAMILY_REGISTRATION_STATE,
  );
  const { email, name, password, passwordVisible, role } = state;
  const canSubmit = canSubmitRegistration(state);
  const passwordInputState = getPasswordInputState(passwordVisible);

  const [nameError, setNameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);

  const handleSubmit = async () => {
    const nextNameError = getNameError(name);
    const nextEmailError = getEmailError(email);
    const nextPasswordError = getNewPasswordError(password);
    setNameError(nextNameError ?? "");
    setEmailError(nextEmailError ?? "");
    setPasswordError(nextPasswordError ?? "");
    setFormError("");

    if (nextNameError || nextEmailError || nextPasswordError) return;

    setIsSubmitting(true);
    const { error } = await signUpWithEmail({ name, email, password, role });
    setIsSubmitting(false);

    if (error) {
      setFormError(error);
      return;
    }

    Alert.alert("登録が完了しました", "ログイン画面からログインしてください。");
    router.replace("/login");
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="flex-grow px-6 pb-10"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="mt-6 flex-row items-center">
            <Pressable
              accessibilityLabel="戻る"
              accessibilityRole="button"
              className="h-11 w-11 items-center justify-center rounded-full bg-white active:bg-slate-200"
              onPress={() => router.back()}
            >
              <Ionicons color="#334155" name="arrow-back" size={22} />
            </Pressable>
          </View>

          <View className="mt-8">
            <Text className="text-3xl font-bold text-slate-900">家族メンバーを登録</Text>
            <Text className="mt-2 text-base leading-6 text-slate-600">
              新しいメンバーの情報と役割を入力してください。
            </Text>
          </View>

          <View className="mt-8 gap-5 rounded-3xl bg-white px-5 py-6">
            <View>
              <Text className="mb-2 text-sm font-semibold text-slate-800">名前</Text>
              <TextInput
                accessibilityLabel="名前"
                autoCapitalize="words"
                className="rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900"
                onChangeText={(value) => {
                  dispatch({ field: "name", type: "updateField", value });
                  setNameError("");
                }}
                onSubmitEditing={() => emailInputRef.current?.focus()}
                placeholder="例：やまだ たろう"
                placeholderTextColor="#94a3b8"
                returnKeyType="next"
                value={name}
              />
              {nameError ? (
                <Text accessibilityRole="alert" className="mt-2 text-sm text-red-600">
                  {nameError}
                </Text>
              ) : null}
            </View>

            <View>
              <Text className="mb-2 text-sm font-semibold text-slate-800">メールアドレス</Text>
              <TextInput
                accessibilityLabel="メールアドレス"
                autoCapitalize="none"
                autoComplete="email"
                className="rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900"
                keyboardType="email-address"
                onChangeText={(value) => {
                  dispatch({ field: "email", type: "updateField", value });
                  setEmailError("");
                }}
                onSubmitEditing={() => passwordInputRef.current?.focus()}
                placeholder="family@example.com"
                placeholderTextColor="#94a3b8"
                ref={emailInputRef}
                returnKeyType="next"
                value={email}
              />
              {emailError ? (
                <Text accessibilityRole="alert" className="mt-2 text-sm text-red-600">
                  {emailError}
                </Text>
              ) : null}
            </View>

            <View>
              <Text className="mb-2 text-sm font-semibold text-slate-800">パスワード</Text>
              <View className="flex-row items-center rounded-xl border border-slate-200">
                <TextInput
                  accessibilityLabel="パスワード"
                  autoCapitalize="none"
                  autoComplete="new-password"
                  className="flex-1 px-4 py-3 text-base text-slate-900"
                  onChangeText={(value) => {
                    dispatch({ field: "password", type: "updateField", value });
                    setPasswordError("");
                  }}
                  onSubmitEditing={handleSubmit}
                  placeholder="パスワードを入力"
                  placeholderTextColor="#94a3b8"
                  ref={passwordInputRef}
                  returnKeyType="done"
                  secureTextEntry={passwordInputState.secureTextEntry}
                  value={password}
                />
                <Pressable
                  accessibilityLabel={passwordInputState.accessibilityLabel}
                  accessibilityRole="button"
                  className="px-4 py-3"
                  onPress={() => dispatch({ type: "togglePasswordVisibility" })}
                >
                  <Ionicons
                    color="#64748b"
                    name={passwordVisible ? "eye-off-outline" : "eye-outline"}
                    size={22}
                  />
                </Pressable>
              </View>
              {passwordError ? (
                <Text accessibilityRole="alert" className="mt-2 text-sm text-red-600">
                  {passwordError}
                </Text>
              ) : null}
            </View>

            <View>
              <Text className="mb-2 text-sm font-semibold text-slate-800">役割</Text>
              <View className="gap-3" accessibilityRole="radiogroup">
                {REGISTRATION_ROLE_OPTIONS.map((option) => {
                  const selected = option.value === role;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      className={`flex-row items-center rounded-xl border px-4 py-4 ${
                        selected ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white"
                      }`}
                      onPress={() => dispatch({ type: "selectRole", value: option.value })}
                    >
                      <View
                        className={`h-10 w-10 items-center justify-center rounded-full ${
                          selected ? "bg-blue-600" : "bg-slate-100"
                        }`}
                      >
                        <Ionicons
                          color={selected ? "#ffffff" : "#64748b"}
                          name={roleIcons[option.value]}
                          size={21}
                        />
                      </View>
                      <View className="ml-3 flex-1">
                        <Text className="text-base font-bold text-slate-900">{option.label}</Text>
                        <Text className="mt-1 text-xs text-slate-500">{option.description}</Text>
                      </View>
                      <Ionicons
                        color={selected ? "#2563eb" : "#cbd5e1"}
                        name={selected ? "radio-button-on" : "radio-button-off"}
                        size={22}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          {formError ? (
            <Text accessibilityRole="alert" className="mt-4 text-center text-sm text-red-600">
              {formError}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit || isSubmitting }}
            className={`mt-8 items-center rounded-xl px-4 py-4 ${
              canSubmit && !isSubmitting ? "bg-blue-600 active:bg-blue-700" : "bg-blue-300"
            }`}
            disabled={!canSubmit || isSubmitting}
            onPress={handleSubmit}
          >
            <Text className="text-base font-bold text-white">
              {isSubmitting ? "登録中..." : "登録"}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
