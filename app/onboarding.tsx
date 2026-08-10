import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { validateBirthDate } from "../lib/birthDateValidation";
import { useAppStore } from "../store";
import type { FamilyRole, Gender } from "../types";

const genderOptions: { label: string; value: Gender }[] = [
  { label: "男性", value: "male" },
  { label: "女性", value: "female" },
  { label: "無回答", value: "unspecified" },
];

const roleOptions: { label: string; value: FamilyRole }[] = [
  { label: "父", value: "father" },
  { label: "母", value: "mother" },
  { label: "子", value: "child" },
];

type ChoiceFieldProps<T extends string> = {
  label: string;
  options: { label: string; value: T }[];
  selectedValue: T | undefined;
  onChange: (value: T) => void;
};

function ChoiceField<T extends string>({
  label,
  options,
  selectedValue,
  onChange,
}: ChoiceFieldProps<T>) {
  return (
    <View className="mt-6">
      <Text className="mb-2 text-sm font-semibold text-slate-800">{label}</Text>
      <View className="flex-row gap-2">
        {options.map((option) => {
          const selected = option.value === selectedValue;

          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              className={`flex-1 items-center rounded-xl border px-2 py-3 ${
                selected ? "border-blue-600 bg-blue-600" : "border-slate-200 bg-white"
              }`}
              onPress={() => onChange(option.value)}
            >
              <Text className={`font-medium ${selected ? "text-white" : "text-slate-700"}`}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function OnboardingScreen() {
  const setUser = useAppStore((state) => state.setUser);
  const onboardingProfile = useAppStore((state) => state.onboardingProfile);
  const updateOnboardingProfile = useAppStore((state) => state.updateOnboardingProfile);
  const { birthDay, birthMonth, birthYear, familyRole, gender, name } = onboardingProfile;

  const handleSubmit = () => {
    const birthDateError = validateBirthDate(birthYear, birthMonth, birthDay);
    if (birthDateError) {
      Alert.alert("生年月日を確認してください", birthDateError);
      return;
    }

    if (!name.trim() || !gender || !familyRole) {
      Alert.alert("入力内容を確認してください", "すべての項目を入力・選択してください。");
      return;
    }

    setUser({
      id: "onboarding-user",
      name: name.trim(),
      role: familyRole === "child" ? "child" : "parent",
      balance: 0,
    });
    router.replace("/");
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerClassName="px-6 pb-10" showsVerticalScrollIndicator={false}>
        <View className="mt-8">
          <Text className="text-3xl font-bold text-slate-900">はじめの設定</Text>
          <Text className="mt-2 text-base leading-6 text-slate-600">
            家族のプロフィールを登録しましょう。
          </Text>
        </View>

        <View className="mt-8 rounded-2xl bg-white px-5 py-6">
          <Text className="text-sm font-semibold text-slate-800">名前</Text>
          <TextInput
            accessibilityLabel="名前"
            autoCapitalize="words"
            className="mt-2 rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900"
            onChangeText={(value) => updateOnboardingProfile({ name: value })}
            placeholder="例：たろう"
            placeholderTextColor="#94a3b8"
            value={name}
          />

          <Text className="mb-2 mt-6 text-sm font-semibold text-slate-800">生年月日</Text>
          <View className="flex-row items-center gap-2">
            <Ionicons color="#64748b" name="calendar-outline" size={20} />
            <TextInput
              accessibilityLabel="生年月日（年）"
              className="flex-1 rounded-xl border border-slate-200 px-3 py-3 text-base text-slate-900"
              keyboardType="number-pad"
              maxLength={4}
              onChangeText={(value) => updateOnboardingProfile({ birthYear: value })}
              placeholder="年"
              placeholderTextColor="#94a3b8"
              value={birthYear}
            />
            <Text className="text-sm text-slate-600">年</Text>
            <TextInput
              accessibilityLabel="生年月日（月）"
              className="w-14 rounded-xl border border-slate-200 px-3 py-3 text-base text-slate-900"
              keyboardType="number-pad"
              maxLength={2}
              onChangeText={(value) => updateOnboardingProfile({ birthMonth: value })}
              placeholder="月"
              placeholderTextColor="#94a3b8"
              value={birthMonth}
            />
            <Text className="text-sm text-slate-600">月</Text>
            <TextInput
              accessibilityLabel="生年月日（日）"
              className="w-14 rounded-xl border border-slate-200 px-3 py-3 text-base text-slate-900"
              keyboardType="number-pad"
              maxLength={2}
              onChangeText={(value) => updateOnboardingProfile({ birthDay: value })}
              placeholder="日"
              placeholderTextColor="#94a3b8"
              value={birthDay}
            />
            <Text className="text-sm text-slate-600">日</Text>
          </View>

          <ChoiceField<Gender>
            label="性別"
            onChange={(value) => updateOnboardingProfile({ gender: value })}
            options={genderOptions}
            selectedValue={gender}
          />
          <ChoiceField<FamilyRole>
            label="役割"
            onChange={(value) => updateOnboardingProfile({ familyRole: value })}
            options={roleOptions}
            selectedValue={familyRole}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          className="mt-8 items-center rounded-xl bg-blue-600 px-4 py-4 active:bg-blue-700"
          onPress={handleSubmit}
        >
          <Text className="text-base font-bold text-white">登録する</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

