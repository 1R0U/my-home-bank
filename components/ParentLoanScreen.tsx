import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatGol } from "../lib/amount";
import { calculateLoanInterest, calculateLoanTotal, formatMonthlyRate, getLoanRemaining, isLoanOverdue, normalizeLoanRatePercentInput } from "../lib/loan";
import {
  approveLoan,
  fetchFamilyBorrowers,
  fetchLoanOffer,
  rejectLoan,
  updateLoanSettings,
  type FamilyBorrower,
} from "../lib/loanService";
import { useLoans } from "../lib/useLoans";
import { useRefetchOnFocus } from "../lib/useRefetchOnFocus";
import { useCurrentUser } from "../store";
import type { LoanOffer } from "../types";
import { PLACEHOLDER_TEXT_COLOR } from "../constants/ui";

type LoanTab = "approval" | "status" | "settings";
type SettingsDraft = { limit: string; ratePercent: string; termDays: string };

const TAB_LABELS: Record<LoanTab, string> = {
  approval: "承認",
  status: "契約状況",
  settings: "設定",
};

export default function ParentLoanScreen() {
  const user = useCurrentUser();
  const { loans, loading, error, isLive, reload } = useLoans();
  const [activeTab, setActiveTab] = useState<LoanTab>("approval");
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [borrowers, setBorrowers] = useState<FamilyBorrower[]>([]);
  const [offers, setOffers] = useState<Record<string, LoanOffer>>({});
  const [offerErrors, setOfferErrors] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, SettingsDraft>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reloadBorrowers = useCallback(async () => {
    if (!isLive || !user?.family_id) return;
    try {
      const nextBorrowers = await fetchFamilyBorrowers(user.family_id);
      setBorrowers(nextBorrowers);
      const results = await Promise.allSettled(
        nextBorrowers.map(async (borrower) => [borrower.id, await fetchLoanOffer(borrower.id)] as const),
      );
      const nextOffers: Record<string, LoanOffer> = {};
      const nextDrafts: Record<string, SettingsDraft> = {};
      const nextErrors: Record<string, string> = {};
      results.forEach((result, index) => {
        const borrower = nextBorrowers[index];
        if (result.status === "rejected") {
          console.warn(`${borrower.name}のローン設定の取得に失敗しました`, result.reason);
          nextErrors[borrower.id] = "ローン設定を取得できませんでした";
          return;
        }
        const [, offer] = result.value;
        nextOffers[borrower.id] = offer;
        nextDrafts[borrower.id] = {
          limit: String(offer.loan_limit),
          ratePercent: String(Math.round(offer.monthly_interest_rate * 1_000_000) / 10_000),
          termDays: String(offer.term_days),
        };
      });
      setOffers(nextOffers);
      setDrafts(nextDrafts);
      setOfferErrors(nextErrors);
    } catch (e) {
      console.warn("ローン設定の取得に失敗しました", e);
      setMessage("ローン設定を取得できませんでした");
    }
  }, [isLive, user?.family_id]);

  useEffect(() => { void reloadBorrowers(); }, [reloadBorrowers]);
  useRefetchOnFocus(reloadBorrowers);

  const pendingLoans = useMemo(() => loans.filter((loan) => loan.status === "pending"), [loans]);
  const contracts = useMemo(() => loans.filter((loan) => loan.status === "active" || loan.status === "paid"), [loans]);
  const selectedLoan = pendingLoans.find((loan) => loan.id === selectedLoanId);
  const borrowerName = (borrowerId: string) => borrowers.find((item) => item.id === borrowerId)?.name ?? "不明";

  const handleDecision = async (kind: "approve" | "reject") => {
    if (!selectedLoan || !user || submittingId) return;
    setSubmittingId(selectedLoan.id);
    setMessage(null);
    try {
      if (kind === "approve") await approveLoan(selectedLoan.id, user.id);
      else await rejectLoan(selectedLoan.id, user.id);
      setSelectedLoanId(null);
      setMessage(kind === "approve" ? "ローンを承認しました" : "ローンを却下しました");
      await Promise.all([reload(), reloadBorrowers()]);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "ローン申請の処理に失敗しました");
    } finally {
      setSubmittingId(null);
    }
  };

  const handleSaveSettings = async (borrowerId: string) => {
    const draft = drafts[borrowerId];
    if (!draft || submittingId) return;
    const limit = Number(draft.limit);
    const rate = Number(draft.ratePercent) / 100;
    const term = Number(draft.termDays);
    const validRateFormat = /^\d+(?:\.\d{1,4})?$/.test(draft.ratePercent);
    if (!Number.isSafeInteger(limit) || limit < 0 || !validRateFormat || !Number.isFinite(rate) || rate < 0 || rate > 1 || !Number.isInteger(term) || term < 1 || term > 3650) {
      setMessage("限度額・月利・期限を正しく入力してください");
      return;
    }
    setSubmittingId(borrowerId);
    setMessage(null);
    try {
      await updateLoanSettings(borrowerId, limit, rate, term);
      setMessage(`${borrowerName(borrowerId)}のローン設定を保存しました`);
      await reloadBorrowers();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "ローン設定の保存に失敗しました");
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={["top", "bottom"]}>
      <View className="flex-row items-center justify-between px-6 pt-4">
        <Text className="text-lg font-bold text-slate-900">ローン</Text>
        <View accessibilityLabel="通知" className="h-14 w-14 items-center justify-center rounded-full bg-white">
          <Ionicons color="#0f172a" name="notifications" size={28} />
        </View>
      </View>

      <View accessibilityRole="tablist" className="flex-row gap-2 px-6 pb-3 pt-4">
        {(Object.keys(TAB_LABELS) as LoanTab[]).map((tab) => {
          const isActive = tab === activeTab;
          const label = tab === "approval" && pendingLoans.length ? `${TAB_LABELS[tab]} (${pendingLoans.length})` : TAB_LABELS[tab];
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              className={`flex-1 items-center rounded-full py-2 ${isActive ? "bg-slate-900" : "bg-white"}`}
              key={tab}
              onPress={() => { setActiveTab(tab); setSelectedLoanId(null); setMessage(null); }}
            >
              <Text className={`text-xs font-semibold ${isActive ? "text-white" : "text-slate-500"}`}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-6 pb-8" showsVerticalScrollIndicator={false}>
        {loading ? <Text className="py-6 text-center text-sm text-slate-400">ローン情報を読み込み中です</Text> : null}
        {error ? <Text accessibilityRole="alert" className="py-3 text-center text-sm text-rose-600">{error}</Text> : null}
        {message ? <Text accessibilityRole="alert" className="mb-3 rounded-xl bg-white p-3 text-sm text-slate-700">{message}</Text> : null}
        {!isLive ? <Text className="mb-3 text-center text-xs text-slate-400">※ プレビュー中は操作できません</Text> : null}

        {activeTab === "approval" ? (
          <>
            <View className="overflow-hidden rounded-2xl bg-white">
              {!loading && pendingLoans.length === 0 ? <Text className="px-4 py-6 text-center text-sm text-slate-400">承認待ちのローン申請はありません</Text> : null}
              {pendingLoans.map((loan, index) => (
                <Pressable
                  accessibilityHint="タップすると下に詳細が表示されます"
                  accessibilityRole="button"
                  accessibilityState={{ selected: loan.id === selectedLoanId }}
                  className={`flex-row items-center justify-between px-4 py-4 ${index !== pendingLoans.length - 1 ? "border-b border-slate-100" : ""}`}
                  key={loan.id}
                  onPress={() => setSelectedLoanId(loan.id === selectedLoanId ? null : loan.id)}
                >
                  <View className="flex-1 pr-3">
                    <Text className="font-semibold text-slate-900">{borrowerName(loan.borrower_id)}</Text>
                    <Text className="mt-1 text-xs text-slate-500" numberOfLines={1}>{loan.purpose}</Text>
                  </View>
                  <Text className="font-bold text-rose-600">{formatGol(loan.requested_amount)}</Text>
                </Pressable>
              ))}
            </View>

            {selectedLoan ? (() => {
              const offer = offers[selectedLoan.borrower_id];
              const interest = calculateLoanInterest(selectedLoan.requested_amount, selectedLoan.monthly_interest_rate, selectedLoan.term_days);
              const actionDisabled = Boolean(submittingId) || !isLive;
              const approveDisabled = actionDisabled || !offer;
              return (
                <View className="mt-4 rounded-2xl bg-white p-5">
                  <Text className="text-xs font-semibold text-slate-400">申請者</Text>
                  <Text className="mt-1 text-lg font-bold text-slate-900">{borrowerName(selectedLoan.borrower_id)}</Text>
                  <Text className="mt-4 text-xs font-semibold text-slate-400">用途</Text>
                  <Text className="mt-1 text-sm text-slate-700">{selectedLoan.purpose}</Text>
                  <View className="mt-4 rounded-xl bg-slate-50 p-4">
                    <Text className="text-sm text-slate-700">元本 {formatGol(selectedLoan.requested_amount)}</Text>
                    <Text className="mt-1 text-sm text-slate-700">月利 {formatMonthlyRate(selectedLoan.monthly_interest_rate)} ／ {selectedLoan.term_days}日</Text>
                    <Text className="mt-1 text-sm text-slate-700">利息 {formatGol(interest)}</Text>
                    <Text className="mt-2 font-bold text-slate-900">返済総額 {formatGol(calculateLoanTotal(selectedLoan.requested_amount, selectedLoan.monthly_interest_rate, selectedLoan.term_days))}</Text>
                    {offer ? (
                      <>
                        <Text className="mt-2 text-xs text-slate-500">承認後の金庫貸出可能残高 {formatGol(Math.max(0, offer.treasury_available - selectedLoan.requested_amount))}</Text>
                      </>
                    ) : <Text accessibilityRole="alert" className="mt-2 text-xs text-rose-600">現在の貸出可能額を取得できないため承認できません</Text>}
                  </View>
                  <View className="mt-4 flex-row gap-3">
                    <Pressable accessibilityLabel="ローンを承認" accessibilityRole="button" accessibilityState={{ disabled: approveDisabled }} className={`flex-1 items-center rounded-xl py-3 ${approveDisabled ? "bg-slate-200" : "bg-emerald-600"}`} disabled={approveDisabled} onPress={() => handleDecision("approve")}>
                      <Text className={`font-bold ${approveDisabled ? "text-slate-400" : "text-white"}`}>承認</Text>
                    </Pressable>
                    <Pressable accessibilityLabel="ローンを却下" accessibilityRole="button" accessibilityState={{ disabled: actionDisabled }} className={`flex-1 items-center rounded-xl py-3 ${actionDisabled ? "bg-slate-200" : "bg-rose-600"}`} disabled={actionDisabled} onPress={() => handleDecision("reject")}>
                      <Text className={`font-bold ${actionDisabled ? "text-slate-400" : "text-white"}`}>却下</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })() : null}
          </>
        ) : null}

        {activeTab === "status" ? (
          <View className="rounded-2xl bg-white p-4">
            <Text className="font-semibold text-slate-700">契約中・完済済みローン</Text>
            {contracts.length === 0 ? <Text className="mt-3 text-sm text-slate-400">ローン契約はありません</Text> : null}
            {contracts.map((loan) => (
              <View className="mt-3 rounded-xl border border-slate-100 p-4" key={loan.id}>
                <View className="flex-row justify-between">
                  <Text className="font-bold text-slate-900">{borrowerName(loan.borrower_id)}</Text>
                  <Text className={`text-xs font-bold ${isLoanOverdue(loan) ? "text-rose-600" : "text-slate-500"}`}>{isLoanOverdue(loan) ? "延滞" : loan.status === "paid" ? "完済" : "契約中"}</Text>
                </View>
                <Text className="mt-1 text-sm text-slate-600">{loan.purpose}</Text>
                <Text className="mt-2 text-xs text-slate-600">元本 {formatGol(loan.principal_amount)} ／ 利息 {formatGol(loan.interest_amount)}</Text>
                <Text className="mt-1 text-xs text-slate-600">返済済み {formatGol(loan.principal_repaid + loan.interest_repaid)} ／ 残額 {formatGol(getLoanRemaining(loan))}</Text>
                {loan.due_at ? <Text className="mt-1 text-xs text-slate-500">期限 {new Date(loan.due_at).toLocaleDateString("ja-JP")}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}

        {activeTab === "settings" ? (
          <View>
            {borrowers.map((borrower) => {
              const draft = drafts[borrower.id];
              const offerError = offerErrors[borrower.id];
              if (!draft) return (
                <View className="mb-4 rounded-2xl bg-white p-5" key={borrower.id}>
                  <Text className="text-base font-bold text-slate-900">{borrower.name}</Text>
                  <Text accessibilityRole="alert" className="mt-3 text-sm text-rose-600">{offerError ?? "ローン設定を読み込み中です"}</Text>
                </View>
              );
              const saveDisabled = Boolean(submittingId) || !isLive;
              return (
                <View className="mb-4 rounded-2xl bg-white p-5" key={borrower.id}>
                  <Text className="text-base font-bold text-slate-900">{borrower.name}</Text>
                  <Text className="mt-3 text-xs font-semibold text-slate-500">個人限度額（gol）</Text>
                  <TextInput accessibilityLabel={`${borrower.name}のローン限度額`} className="mt-1 rounded-xl bg-slate-50 px-4 py-3" keyboardType="number-pad" onChangeText={(limit) => setDrafts((current) => ({ ...current, [borrower.id]: { ...current[borrower.id], limit: limit.replace(/[^0-9]/g, "") } }))} placeholderTextColor={PLACEHOLDER_TEXT_COLOR} value={draft.limit} />
                  <Text className="mt-3 text-xs font-semibold text-slate-500">月利（%）</Text>
                  <TextInput accessibilityLabel={`${borrower.name}の月利`} className="mt-1 rounded-xl bg-slate-50 px-4 py-3" keyboardType="decimal-pad" onChangeText={(ratePercent) => setDrafts((current) => ({ ...current, [borrower.id]: { ...current[borrower.id], ratePercent: normalizeLoanRatePercentInput(ratePercent) } }))} placeholderTextColor={PLACEHOLDER_TEXT_COLOR} value={draft.ratePercent} />
                  <Text className="mt-3 text-xs font-semibold text-slate-500">標準返済期限（日）</Text>
                  <TextInput accessibilityLabel={`${borrower.name}の返済期限`} className="mt-1 rounded-xl bg-slate-50 px-4 py-3" keyboardType="number-pad" onChangeText={(termDays) => setDrafts((current) => ({ ...current, [borrower.id]: { ...current[borrower.id], termDays: termDays.replace(/[^0-9]/g, "") } }))} placeholderTextColor={PLACEHOLDER_TEXT_COLOR} value={draft.termDays} />
                  <Pressable accessibilityLabel={`${borrower.name}のローン設定を保存`} accessibilityRole="button" accessibilityState={{ disabled: saveDisabled }} className={`mt-4 items-center rounded-xl py-3 ${saveDisabled ? "bg-slate-200" : "bg-slate-900"}`} disabled={saveDisabled} onPress={() => handleSaveSettings(borrower.id)}>
                    <Text className={`font-bold ${saveDisabled ? "text-slate-400" : "text-white"}`}>設定を保存</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
