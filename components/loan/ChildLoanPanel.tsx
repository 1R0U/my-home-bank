import { Pressable, Text, TextInput, View } from "react-native";
import PressableBox from "../PressableBox";
import { GOL_COIN_MARK, formatGol } from "../../lib/amount";
import { formatMonthlyRate } from "../../lib/loan";
import { bankStyles } from "../bank/bankStyles";
import Furigana from "../Furigana";
import { CHILD_LOAN_PLACEHOLDER_COLOR, childLoanStyles as styles } from "./childLoanStyles";
import { useLoanPanel } from "./useLoanPanel";

type Props = {
  userId: string;
  walletBalance: number;
  onBalanceChanged: () => Promise<unknown>;
};

/** 状態の表示名のふりがな。表示名は `useLoanPanel` と同じ */
const STATUS_FURIGANA: Record<string, string> = {
  延滞: "{延滞|えんたい}",
  承認待ち: "{承認|しょうにん}{待|ま}ち",
  完済: "{完済|かんさい}",
  却下: "{却下|きゃっか}",
  契約中: "{契約中|けいやくちゅう}",
};

/**
 * 子供用の銀行画面（`ChildBankScreen`）のローン欄（Issue #437）。銀行画面と同じ木と羊皮紙の見た目にする。
 *
 * 処理は大人用（`AdultLoanPanel`）と共通の `useLoanPanel` に置き、ここは見た目（`StyleSheet` + `CHILD_THEME`）だけを持つ。
 * 見出しやボタンにはふりがなを付ける。金額を並べた行と、処理の結果の文言（`useLoanPanel` や
 * 共通のエラー文言）は大人用と同じ言葉のままにしている（銀行画面の失敗の文言と同じ扱い）。
 */
export default function ChildLoanPanel({ userId, walletBalance, onBalanceChanged }: Props) {
  const panel = useLoanPanel({ userId, walletBalance, onBalanceChanged });
  const { offer, loading, error, isLive, amount, requestError, isSubmitting, inputsLocked, canOperate, canRequest, pendingRepayment } = panel;
  const requestMaximumDisabled = !canOperate || isSubmitting || panel.requestMaximum === 0;
  const requestDisabled = !canRequest || isSubmitting;

  return (
    <View style={bankStyles.frame}>
      <View style={bankStyles.sign}>
        <Furigana noWrap style={bankStyles.signText}>{"ゴルを{借|か}りる"}</Furigana>
      </View>
      <Furigana style={styles.frameNote}>{"{借|か}りるのは、おとなが「いいよ」と{言|い}ってからだよ"}</Furigana>
      {loading ? <Furigana style={styles.frameNoteMuted}>{"よみこみちゅう…"}</Furigana> : null}
      {error ? <Text accessibilityRole="alert" style={bankStyles.errorText}>{error}</Text> : null}

      {offer ? (
        <View style={bankStyles.balanceCard}>
          <Furigana style={bankStyles.balanceLabel}>{"{借|か}りられるゴル"}</Furigana>
          <View style={bankStyles.balanceRow}>
            <View style={bankStyles.coin}>
              <Text style={bankStyles.coinText}>{GOL_COIN_MARK}</Text>
            </View>
            <Text accessibilityLabel="借入可能額" style={bankStyles.balanceValue}>{formatGol(offer.available_amount)}</Text>
          </View>
          <Text style={styles.cardNote}>
            月利 {formatMonthlyRate(offer.monthly_interest_rate)} ／ 期限 {offer.term_days}日
          </Text>
          <Text style={styles.cardNote}>
            個人限度額 {formatGol(offer.loan_limit)} ／ 未返済元本 {formatGol(offer.outstanding_principal)}
          </Text>
          {offer.has_overdue ? (
            <Furigana style={styles.errorText}>{"{返|かえ}すのがおくれているから、いまは{借|か}りられないよ"}</Furigana>
          ) : null}
        </View>
      ) : null}

      <View style={bankStyles.balanceCard}>
        <Furigana style={styles.fieldLabel}>{"{借|か}りるゴル"}</Furigana>
        <Text accessibilityLabel="ローン申請の最大金額" style={styles.cardNote}>
          入力可能な最大金額 {panel.offerReady ? formatGol(panel.requestMaximum) : "—"}
        </Text>
        <TextInput
          accessibilityLabel="ローン申請額"
          editable={!inputsLocked}
          keyboardType="number-pad"
          onChangeText={panel.changeAmountText}
          placeholder="れい: 100"
          placeholderTextColor={CHILD_LOAN_PLACEHOLDER_COLOR}
          style={[styles.input, inputsLocked && styles.inputLocked]}
          value={panel.amountText}
        />
        {requestError ? <Text accessibilityRole="alert" style={styles.errorText}>{requestError}</Text> : null}
        <Pressable accessibilityLabel="借入可能な最大額を入力" accessibilityRole="button"
          accessibilityState={{ disabled: requestMaximumDisabled }} disabled={requestMaximumDisabled}
          onPress={panel.fillRequestMaximum}
          style={[styles.textButton, requestMaximumDisabled && styles.textButtonDisabled]}>
          <Furigana noWrap style={styles.textButtonText}>{"{借|か}りられるだけ{入|い}れる"}</Furigana>
        </Pressable>

        <Furigana style={styles.fieldLabel}>{"なにに{使|つか}う？"}</Furigana>
        <TextInput
          accessibilityLabel="ローンの用途"
          editable={!inputsLocked}
          maxLength={500}
          onChangeText={panel.changePurpose}
          placeholder="つかいみちを かいてね"
          placeholderTextColor={CHILD_LOAN_PLACEHOLDER_COLOR}
          style={[styles.input, inputsLocked && styles.inputLocked]}
          value={panel.purpose}
        />
        {amount !== null && !requestError && offer ? (
          <View style={styles.preview}>
            <Text style={styles.cardNote}>元本 {formatGol(amount)} ＋ 利息 {formatGol(panel.previewInterest)}</Text>
            <Text style={styles.cardStrong}>返済予定額 {formatGol(panel.previewTotal)}</Text>
          </View>
        ) : null}
        <PressableBox
          accessibilityLabel="ローンを申請する"
          accessibilityRole="button"
          accessibilityState={{ disabled: requestDisabled }}
          disabled={requestDisabled}
          onPress={panel.handleRequest}
          pressedStyle={bankStyles.pressed}
          style={[
            styles.actionButton,
            requestDisabled && bankStyles.actionButtonDisabled,
          ]}
        >
          <Furigana noWrap style={[bankStyles.actionButtonText, requestDisabled && bankStyles.actionButtonTextDisabled]}>
            {panel.pendingLoan ? "{返事|へんじ}を{待|ま}っているよ" : "おねがいする"}
          </Furigana>
        </PressableBox>
        <Pressable accessibilityLabel="ローン申請の入力をキャンセル" accessibilityRole="button"
          accessibilityState={{ disabled: inputsLocked }} disabled={inputsLocked}
          onPress={panel.cancelRequest}
          style={[styles.textButtonCenter, inputsLocked && styles.textButtonDisabled]}>
          <Furigana noWrap style={styles.textButtonText}>{"{入力|にゅうりょく}をやめる"}</Furigana>
        </Pressable>
      </View>

      {panel.message ? <Text accessibilityRole="alert" style={styles.frameNote}>{panel.message}</Text> : null}
      {pendingRepayment ? (
        <View style={bankStyles.notice}>
          <Text accessibilityRole="alert" style={bankStyles.noticeText}>
            返済 {formatGol(pendingRepayment.amount)} の結果を確認しています。確認が済むまで金額の変更・キャンセルはできません。
          </Text>
          <Pressable accessibilityLabel="返済の結果を確認" accessibilityRole="button"
            accessibilityState={{ disabled: isSubmitting || !isLive }} disabled={isSubmitting || !isLive}
            onPress={() => panel.handleRepay(pendingRepayment.loanId)} style={bankStyles.noticeLink}>
            <Furigana style={bankStyles.noticeLinkText}>{"{返|かえ}した{結果|けっか}を{確|たし}かめる"}</Furigana>
          </Pressable>
        </View>
      ) : null}
      {!isLive ? <Furigana style={styles.frameNoteMuted}>{"※ おためし{中|ちゅう}は{借|か}りたり{返|かえ}したりできないよ"}</Furigana> : null}

      <Furigana style={styles.sectionTitle}>{"{借|か}りているゴル"}</Furigana>
      {panel.rows.length === 0 ? <Furigana style={styles.frameNoteMuted}>{"いまは{借|か}りていないよ"}</Furigana> : null}
      {panel.rows.map((row) => {
        const { loan } = row;
        const repayMaximumDisabled = !canOperate || isSubmitting || row.repayMaximum === 0;
        const repayDisabled = !row.canRepay || isSubmitting;
        return (
          <View key={loan.id} style={bankStyles.balanceCard}>
            <View style={styles.loanRowHeader}>
              <Text style={styles.loanPurpose}>{loan.purpose}</Text>
              <Furigana noWrap style={[styles.status, row.isOverdue && styles.statusOverdue]}>
                {STATUS_FURIGANA[row.statusLabel] ?? row.statusLabel}
              </Furigana>
            </View>
            <Text style={styles.cardNote}>
              元本 {formatGol(loan.principal_amount ?? loan.requested_amount)} ／ 利息 {formatGol(loan.interest_amount ?? row.pendingInterest)}
            </Text>
            <Text style={styles.cardStrong}>残額 {formatGol(row.displayedRemaining)}</Text>
            {loan.due_at ? <Text style={styles.cardNote}>期限 {new Date(loan.due_at).toLocaleDateString("ja-JP")}</Text> : null}
            {loan.status === "active" ? (
              <View style={styles.repayArea}>
                <Text accessibilityLabel={`${loan.purpose}の返済可能な最大金額`} style={styles.cardNote}>
                  返済可能な最大金額 {formatGol(row.repayMaximum)}
                </Text>
                <TextInput
                  accessibilityLabel={`${loan.purpose}の返済額`}
                  editable={!inputsLocked}
                  keyboardType="number-pad"
                  onChangeText={(value) => panel.changeRepayText(loan.id, value)}
                  placeholder={row.repayMaximum > 0 ? `1〜${row.repayMaximum}` : "0"}
                  placeholderTextColor={CHILD_LOAN_PLACEHOLDER_COLOR}
                  style={[styles.input, inputsLocked && styles.inputLocked]}
                  value={row.repayText}
                />
                {row.repayError ? <Text accessibilityRole="alert" style={styles.errorText}>{row.repayError}</Text> : null}
                <Pressable accessibilityLabel={`${loan.purpose}の返済可能な最大額を入力`} accessibilityRole="button"
                  accessibilityState={{ disabled: repayMaximumDisabled }} disabled={repayMaximumDisabled}
                  onPress={() => panel.fillRepayMaximum(row)}
                  style={[styles.textButton, repayMaximumDisabled && styles.textButtonDisabled]}>
                  <Furigana noWrap style={styles.textButtonText}>{"{返|かえ}せるだけ{入|い}れる"}</Furigana>
                </Pressable>
                <PressableBox
                  accessibilityLabel={`${loan.purpose}を返済する`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: repayDisabled }}
                  disabled={repayDisabled}
                  onPress={() => panel.handleRepay(loan.id)}
                  pressedStyle={bankStyles.pressed}
                  style={[
                    styles.actionButton,
                    repayDisabled && bankStyles.actionButtonDisabled,
                  ]}
                >
                  <Furigana noWrap style={[bankStyles.actionButtonText, repayDisabled && bankStyles.actionButtonTextDisabled]}>
                    {row.isSending ? "{返|かえ}しているよ…" : "{返|かえ}す"}
                  </Furigana>
                </PressableBox>
                <Pressable accessibilityLabel={`${loan.purpose}の返済入力をキャンセル`} accessibilityRole="button"
                  accessibilityState={{ disabled: inputsLocked }} disabled={inputsLocked}
                  onPress={() => panel.cancelRepay(loan.id)}
                  style={[styles.textButtonCenter, inputsLocked && styles.textButtonDisabled]}>
                  <Furigana noWrap style={styles.textButtonText}>{"{入力|にゅうりょく}をやめる"}</Furigana>
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
