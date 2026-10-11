import { Text } from "react-native";
import { ERROR_TEXT_CLASS } from "../constants/ui";
import { useAppStore } from "../store";

/** セッション失効の理由を、親・子のログイン画面で表示する。 */
export default function LoginNotice() {
  const notice = useAppStore((state) => state.loginNotice);
  return notice ? <Text accessibilityRole="alert" className={`mb-4 text-center text-sm ${ERROR_TEXT_CLASS}`}>
    {notice}
  </Text> : null;
}
