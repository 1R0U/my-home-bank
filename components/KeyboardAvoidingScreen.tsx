import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform } from "react-native";

type KeyboardAvoidingScreenProps = {
  children: ReactNode;
};

export default function KeyboardAvoidingScreen({ children }: KeyboardAvoidingScreenProps) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
      {children}
    </KeyboardAvoidingView>
  );
}
