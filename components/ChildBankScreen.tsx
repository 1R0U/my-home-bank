import { router, Stack } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import BankAmountModal from "./bank/BankAmountModal";
import { bankStyles as styles } from "./bank/bankStyles";
import Furigana from "./Furigana";
import ChildLoanPanel from "./loan/ChildLoanPanel";
import TutorialPressable from "./tutorial/TutorialPressable";
import { GOL_COIN_MARK, formatGol } from "../lib/amount";
import { useBankOperations, type BankOperation } from "../lib/useBankOperations";
import { CLOSED_FEATURE_LINES } from "../lib/childFeatures";
import { useFeatureAvailable } from "../lib/useChildFeatureRestrictions";
import { useTravelArrival } from "../lib/useTravelArrival";

/** 操作の名前（ふりがな付き）。読み上げ用の名前は大人用と同じ「預入」「引き出し」 */
const OPERATION_LABELS: Record<BankOperation, { plain: string; ruby: string }> = {
  deposit: { plain: "預入", ruby: "{預入|あずけいれ}" },
  withdraw: { plain: "引き出し", ruby: "{引|ひ}き{出|だ}し" },
};

/** 前の画面へ戻るボタン。ログイン前の案内と通常の画面の両方に出す */
function BackButton() {
  return (
    <TutorialPressable tutorialId="child-bank-back"
      accessibilityLabel="戻る"
      accessibilityRole="button"
      onPress={() => router.back()}
      style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
    >
      <Text style={styles.backArrow}>‹</Text>
      <Furigana noWrap style={styles.backButtonText}>{"{戻|もど}る"}</Furigana>
    </TutorialPressable>
  );
}

/**
 * 子供用の銀行画面（Issue #437）。タスク・ストアと同じ木と羊皮紙の見た目にする。
 *
 * 預入・引き出しの処理は大人用（`AdultBankScreen`）と共通の `useBankOperations` に置き、
 * ここは見た目（`StyleSheet` + `CHILD_THEME`）だけを持つ。
 * 借り入れの欄（`ChildLoanPanel`）も子供用の見た目にした。金額の入力（`BankAmountModal`）は、今は大人用と同じ部品を使う。
 */
export default function ChildBankScreen() {
  const bank = useBankOperations();
  const { user, accountError, walletBalance, depositBalance, pending, isSubmitting, errorMessage, activeOperation, canOperate } = bank;
  // 我が家タウンから入ってきたときは、読み込み中の間「いどうちゅう」の画面を出しておく（Issue #261）
  useTravelArrival(!bank.accountLoading);
  // 親が銀行を使わないにしていたら、中を見せない（Issue #348）。町では建物に入れないが、
  // お知らせからの移動などで開かれたときのために、ここでも止める
  const isBankAvailable = useFeatureAvailable("bank");

  if (!user || !isBankAvailable) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loginRequired}>
          <Furigana style={styles.noticeText}>
            {user ? CLOSED_FEATURE_LINES.bank.join("") : "{銀行|ぎんこう}を{利用|りよう}するにはログインしてください。"}
          </Furigana>
        </View>
        <View style={styles.footer}>
          <BackButton />
        </View>
      </SafeAreaView>
    );
  }

  /** 操作のボタン。押せないときは色を落とす */
  const renderActionButton = (operation: BankOperation) => (
    <Pressable
      accessibilityLabel={OPERATION_LABELS[operation].plain}
      accessibilityRole="button"
      accessibilityState={{ disabled: !canOperate }}
      disabled={!canOperate}
      key={operation}
      onPress={() => bank.openOperation(operation)}
      style={({ pressed }) => [
        styles.actionButton,
        operation === "withdraw" && styles.actionButtonSecondary,
        !canOperate && styles.actionButtonDisabled,
        pressed && styles.pressed,
      ]}
    >
      <Furigana noWrap style={[styles.actionButtonText, !canOperate && styles.actionButtonTextDisabled]}>
        {OPERATION_LABELS[operation].ruby}
      </Furigana>
    </Pressable>
  );

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>MY HOME BANK</Text>
          <Furigana style={styles.screenTitle}>{"{銀行|ぎんこう}"}</Furigana>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.frame}>
          <View style={styles.sign}>
            <Text style={styles.signText}>BANK</Text>
          </View>
          {accountError ? (
            <Furigana accessibilityRole="alert" style={styles.errorText}>
              {"{口座|こうざ}の{情報|じょうほう}を{取得|しゅとく}できませんでした"}
            </Furigana>
          ) : null}
          <View style={styles.balanceCard}>
            <Furigana style={styles.balanceLabel}>{"いまの おさいふ"}</Furigana>
            <View style={styles.balanceRow}>
              <View style={styles.coin}>
                <Text style={styles.coinText}>{GOL_COIN_MARK}</Text>
              </View>
              <Text accessibilityLabel="現在の所持金" style={styles.balanceValue}>{formatGol(walletBalance)}</Text>
            </View>
          </View>
          <View style={styles.balanceCard}>
            <Furigana style={styles.balanceLabel}>{"{銀行|ぎんこう}に{預|あず}けているゴル"}</Furigana>
            <View style={styles.balanceRow}>
              <View style={styles.coin}>
                <Text style={styles.coinText}>{GOL_COIN_MARK}</Text>
              </View>
              {/* 取得に失敗したときに0と出すと、預金が0ゴルだと誤解させる（Issue #212） */}
              <Text accessibilityLabel="預金残高" style={styles.balanceValue}>
                {accountError ? "—" : formatGol(depositBalance)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.frame}>
          {bank.isCorrupt ? (
            <View style={styles.notice}>
              <Furigana accessibilityRole="alert" style={styles.noticeText}>
                {"{前回|ぜんかい}の{操作|そうさ}の{結果|けっか}を{確認|かくにん}できません。{残高|ざんだか}と{履歴|りれき}を{確認|かくにん}してから{解除|かいじょ}してください。{解除|かいじょ}{後|ご}に{同|おな}じ{操作|そうさ}を{行|おこな}うと、{二重|にじゅう}に{反映|はんえい}される{可能性|かのうせい}があります。"}
              </Furigana>
              <Pressable accessibilityLabel="取引履歴を確認" accessibilityRole="button" disabled={isSubmitting}
                accessibilityState={{ disabled: isSubmitting }}
                onPress={() => router.push("/history-child")} style={styles.noticeLink}>
                <Furigana style={styles.noticeLinkText}>{"{取引|とりひき}{履歴|りれき}を{確認|かくにん}"}</Furigana>
              </Pressable>
              <Pressable accessibilityLabel="残高と履歴を確認したので解除" accessibilityRole="button" disabled={isSubmitting}
                accessibilityState={{ disabled: isSubmitting }}
                onPress={bank.discardCorrupt} style={styles.noticeLink}>
                <Furigana style={styles.noticeLinkText}>
                  {"{残高|ざんだか}と{履歴|りれき}を{確認|かくにん}したので{解除|かいじょ}"}
                </Furigana>
              </Pressable>
              {/* 失敗の文言は大人用と共通（useBankOperations）なので、ふりがなは付けない */}
              {errorMessage ? <Text accessibilityRole="alert" style={styles.errorText}>{errorMessage}</Text> : null}
            </View>
          ) : pending ? (
            <View style={styles.notice}>
              <Furigana style={styles.noticeText}>
                {`${OPERATION_LABELS[pending.kind].ruby} ${formatGol(pending.amount)} の{結果|けっか}が{確認|かくにん}{待|ま}ちです。`}
              </Furigana>
              <Pressable accessibilityLabel="操作の結果を確認" accessibilityRole="button"
                disabled={isSubmitting || !bank.isLive}
                accessibilityState={{ disabled: isSubmitting || !bank.isLive }}
                onPress={() => bank.openOperation(pending.kind)} style={styles.noticeLink}>
                <Furigana style={styles.noticeLinkText}>{"{操作|そうさ}の{結果|けっか}を{確認|かくにん}"}</Furigana>
              </Pressable>
            </View>
          ) : errorMessage && !activeOperation ? (
            <Text accessibilityRole="alert" style={styles.errorText}>{errorMessage}</Text>
          ) : null}
          <View style={styles.actionRow}>
            {renderActionButton("deposit")}
            {renderActionButton("withdraw")}
          </View>
        </View>

        <Pressable accessibilityLabel="自動積立預金" accessibilityRole="button"
          onPress={() => router.push("/savings-child")}
          style={({ pressed }) => [styles.savingsButton, pressed && styles.pressed]}>
          <Furigana noWrap style={styles.savingsButtonText}>{"{自動|じどう}{積立|つみたて}{預金|よきん}"}</Furigana>
        </Pressable>

        <ChildLoanPanel
          key={user.id}
          onBalanceChanged={bank.refreshBalances}
          userId={user.id}
          walletBalance={walletBalance}
        />
      </ScrollView>

      <View style={styles.footer}>
        <BackButton />
      </View>

      <BankAmountModal
        walletBalance={walletBalance}
        depositBalance={depositBalance}
        fixedAmount={pending?.amount}
        canSubmit={activeOperation ? bank.canSubmitFor(activeOperation) : () => false}
        errorMessage={errorMessage}
        isLive={bank.isLive}
        isSubmitting={isSubmitting}
        onClose={bank.closeModal}
        onConfirm={bank.confirm}
        operation={activeOperation}
      />
    </SafeAreaView>
  );
}
