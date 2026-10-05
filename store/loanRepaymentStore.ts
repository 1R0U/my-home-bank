import { create } from "zustand";

export type LoanRepaymentOperation = { loanId: string; amount: number; key: string };

type LoanRepaymentStore = {
  pendingByUser: Record<string, LoanRepaymentOperation>;
  sendingByUser: Record<string, LoanRepaymentOperation>;
  start: (userId: string, operation: LoanRepaymentOperation) => boolean;
  retainUnknown: (userId: string, operation: LoanRepaymentOperation) => void;
  resolve: (userId: string, operation: LoanRepaymentOperation) => void;
  finishSending: (userId: string, operation: LoanRepaymentOperation) => void;
};

/** 画面を離れても、利用者ごとの送信中・結果未確認の返済を保持する。 */
export const useLoanRepaymentStore = create<LoanRepaymentStore>((set, get) => ({
  pendingByUser: {},
  sendingByUser: {},
  /** 画面が重複しても、同じ利用者の返済送信を一つに限定する。 */
  start: (userId, operation) => {
    const { sendingByUser, pendingByUser } = get();
    const pending = pendingByUser[userId];
    if (sendingByUser[userId] || (pending && (pending.key !== operation.key ||
      pending.loanId !== operation.loanId || pending.amount !== operation.amount))) return false;
    set({ sendingByUser: { ...sendingByUser, [userId]: operation } });
    return true;
  },
  /** 応答が不明な場合だけ、画面を離れても照合できる記録にする。 */
  retainUnknown: (userId, operation) => {
    if (get().sendingByUser[userId]?.key !== operation.key) return;
    set((state) => ({ pendingByUser: { ...state.pendingByUser, [userId]: operation } }));
  },
  /** 成功または明示的な拒否を確認した返済だけ、保留を解く。 */
  resolve: (userId, operation) => {
    if (get().pendingByUser[userId]?.key !== operation.key) return;
    set((state) => {
      const pendingByUser = { ...state.pendingByUser };
      delete pendingByUser[userId];
      return { pendingByUser };
    });
  },
  /** 別の画面から始まった新しい送信を、古い完了処理で解除しない。 */
  finishSending: (userId, operation) => {
    if (get().sendingByUser[userId]?.key !== operation.key) return;
    set((state) => {
      const sendingByUser = { ...state.sendingByUser };
      delete sendingByUser[userId];
      return { sendingByUser };
    });
  },
}));
