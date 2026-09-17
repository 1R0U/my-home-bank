# 用語集（このアプリが扱う言葉）

このアプリで使う言葉の意味をそろえるための表です。Issue、PR、画面、関数名、テストでも、ここに書いた意味で言葉を使います。

## この文書の使い方

- **現在のコードに合わせて書いています。** 「こうあるべき」という提案ではありません。実装と食い違いがある場合は、実装側を正として記録し、気になる点は「未確定・要確認」に残しています。
- **意味が決まっていない言葉は「要確認」と明記しています。** 決まっている仕様と、これから決めることを混ぜないためです。
- 仕様を変えるときは、用語の意味も変わるかを確認し、変わる場合は同じIssue・PRでこの表も更新してください。
- 名前をそろえるためだけの一括リネームは行いません。関連する処理を変更するときに、少しずつ寄せていきます。

関連: [AGENTS.md](../AGENTS.md) / [README.md](../README.md) / [docs/DEVELOPMENT.md](DEVELOPMENT.md)

---

## 1. お金（通貨と残高）

| 言葉 | このアプリでの意味 | コード上の名前 | 混同しやすいこと・未確定の点 |
| --- | --- | --- | --- |
| 家庭内通貨 | このアプリの中だけで使うお金。現金とは交換しない | （通貨そのものを表す型はない） | READMEでは `$HMC`、画面やコードでは「ポイント」「P」と呼んでいる。銀行画面だけ `¥` 表記（後述） |
| お財布残高 | すぐに使える残高。預金・借金は含まない | `User.balance` | `BankAccount.deposit_balance` とは別。「残高」とだけ書くとどちらか分からない |
| 預金残高 | 銀行に預けている残高 | `BankAccount.deposit_balance` | お財布残高には含まれない。DB制約で0以上 |
| 借入残高 | まだ返していない借金の額 | `BankAccount.loan_balance` | 「持っている通貨」ではなく、これから返すもの。保有額に足さない。DB制約で0以上 |
| 保有する通貨の総量 | お財布 ＋ 預金 − 借金 | （専用の名前はまだない） | 収支グラフの累積値は、この値の**増減分**を取得した履歴の範囲で足したもの。0から始まるため、残高そのものとは一致しない。画面に出す名前は未確定 |
| 預金利率 | 預金に付く利率 | `BankAccount.interest_rate` | 既定値 `0.05`。**どの期間あたりの率かは未確定**（週利・月利・年利のどれか決まっていない） |
| 借入利率 | 借金に付く利率 | `BankAccount.loan_rate` | 既定値 `0.10`。同じく**期間の単位が未確定** |

### 金額の扱い

- 利用者が入力できる金額は**正の整数のみ**です。銀行RPCが `p_amount <= 0` と `p_amount <> trunc(p_amount)` を拒否します。
- `Transaction.amount` はDB側で `integer`、`BankAccount` の各残高は `numeric` です。
- `users.balance` と `quests.reward_amount` はDB側では `numeric` です（稼働中のSupabaseプロジェクトで確認済み）。アプリは正の整数しか受け付けませんが、**DBの型としては小数を保存できます**。`approve_quest_log` が `q.reward_amount::integer` とキャストしているのはこのためです。
- **金額の上限は決まっていません。** 借り入れにも上限がありません（`canBorrow` は「上限は設けない」と明記、DB側にも上限の検証なし）。

### 表記の揺れ（要確認）

| 場所 | 表示 | 実装 |
| --- | --- | --- |
| 銀行画面 | `¥1,000` | `formatYen`（`Intl.NumberFormat` の `currency: "JPY"`） |
| 履歴画面 | `+50P` | 文字列で `P` を付けている |
| ストア画面 | `1,000ポイント`（読み上げ） | `toLocaleString("ja-JP")` |

同じ家庭内通貨を3通りに表示しています。どれに寄せるかは未確定です。

---

## 2. 銀行の操作

4つの操作はすべてDB側の関数（RPC）で1トランザクションとして実行し、途中で失敗した場合はまとめて取り消されます。

| 言葉 | このアプリでの意味 | コード上の名前 | 混同しやすいこと・未確定の点 |
| --- | --- | --- | --- |
| 預入 | お財布を減らし、同額を預金へ移す | `bankDeposit` / `bank_deposit` | 支出ではない（置き場所が変わるだけ）。台帳には財布の増減として負の額で記帳する |
| 引き出し | 預金を減らし、同額をお財布へ移す | `bankWithdraw` / `bank_withdraw` | 収入ではない。台帳には正の額で記帳する |
| 借り入れ | 借入残高とお財布を同額増やす | `bankBorrow` / `bank_borrow` | 稼いだお金ではない。同額の返す義務が同時に増える |
| 返済 | お財布と借入残高を同額減らす | `bankRepay` / `bank_repay` | 借入残高を超える返済は拒否される |
| 利息 | 預金や借金に付く利息 | `bank_interest`（取引種別のみ） | **未実装。** 利率の列と取引種別はあるが、利息を計算・付与する処理はまだない |

---

## 3. 収支の分類

台帳（`transactions`）には全操作を記帳し、**収支として数えるかどうかは取引種別で決めます**。金額の符号では判断しません（[Issue #143](https://github.com/1R0U/my-home-bank/issues/143)）。

定義の実体は [`lib/transactionClassification.ts`](../lib/transactionClassification.ts) にあります。

| 言葉 | このアプリでの意味 | 対象の取引種別 |
| --- | --- | --- |
| 収入 | 保有する通貨が新しく手に入る取引 | `quest_reward` / `bank_interest` |
| 支出 | 保有する通貨を使ってなくなる取引 | `store_purchase` |
| 振替 | 保有する通貨の置き場所が変わるだけの取引 | `bank_deposit` / `bank_withdraw` / `bank_loan` / `bank_repay` |

分類の基準は「**お財布 ＋ 預金 − 借金が増減するか**」です。振替は収支グラフにも累積残高にも影響しません。

| 言葉 | このアプリでの意味 | コード上の名前 | 混同しやすいこと・未確定の点 |
| --- | --- | --- | --- |
| 台帳 | 通貨の増減を種類横断で記録する表 | `transactions` | 画面表示用の履歴であると同時に、報酬の二重付与を防ぐ記録でもある |
| 取引の金額 | **お財布残高がどちら向きに動くか** | `Transaction.amount` | 操作した額そのものではない。預入30なら `-30`。符号だけで収支を判断しない |
| 取引種別 | その取引が何の操作だったか | `Transaction.type` | 収支の分類とは別。種別は7つ、分類は3つ |

---

## 4. クエスト（お手伝い）

| 言葉 | このアプリでの意味 | コード上の名前 | 混同しやすいこと・未確定の点 |
| --- | --- | --- | --- |
| クエスト | 親が用意した、お手伝いの項目そのもの | `Quest` / `quests` | 「1回の実施」ではない。同じクエストを繰り返す場合の扱いは未確定 |
| 完了申請 | クエストを終えたことを報告し、承認を待つ1回の記録 | `QuestLog` / `quest_logs` | `Quest` とは別。1回の実施はこちらで数える |
| 受注 | 子がクエストを引き受け、自分に割り当てること | `acceptQuest` | 受注すると `Quest.status` が `accepted` になり `assigned_to` が入る |
| 完了申請する | 受注したクエストを終えたと報告すること | `submitQuestCompletion` / `submit_quest_completion` | 申請しただけでは報酬は付かない |
| 承認 | 完了申請を認め、報酬を確定すること | `approveQuestLog` / `approve_quest_log` | 承認と同時に報酬付与・記帳・残高加算が確定する |
| 却下 | 完了申請を認めないこと | `rejectQuestLog` / `reject_quest_log` | クエストは `open` に戻り、`assigned_to` は空になる |
| 報酬額 | そのクエストを承認したときに付く額 | `Quest.reward_amount` | **承認時の額を使う。** 受注後に親が額を変えると、変更後の額が付く |
| 報酬付与 | 承認された申請に対して通貨を発行すること | （`approve_quest_log` の中の処理） | 台帳へ `quest_reward` として記帳し、お財布へ加算する |

### 2つの `status` の違い

同じ `pending` という値が両方にありますが、意味が違います。

| | `Quest.status` | `QuestLog.status` |
| --- | --- | --- |
| 何の状態か | クエストの進み具合 | 1回の完了申請の承認状況 |
| 取りうる値 | `open` / `accepted` / `pending` / `completed` | `pending` / `approved` / `rejected` |
| `pending` の意味 | 誰かが完了申請を出し、承認待ち | この申請が承認待ち |

流れは次のとおりです。

```text
open ──受注──> accepted ──完了申請──> pending ──承認──> completed
                                        │
                                        └──却下──> open（assigned_to を空にする）
```

### 同じ申請に報酬を二度付けない仕組み

`transactions` の部分一意インデックス `transactions_quest_log_id_unique` により、1つの `quest_log` から記帳できる台帳の行は1件までです。`approve_quest_log` は実際に記帳できた場合だけ残高を加算します。

---

## 5. 自主報告（タスク報告）

| 言葉 | このアプリでの意味 | コード上の名前 | 混同しやすいこと・未確定の点 |
| --- | --- | --- | --- |
| タスク報告 | 子が自主的に行った家事を、クエストとは別に報告するもの | `TaskReport` / `task_reports` | クエストの完了申請とは別の仕組み。報酬額の指定はない |

**現在は報告の作成のみ実装されています。** 承認・却下の処理と、報酬を付ける処理はまだありません（`status` の列と `approved_by` / `approved_at` の列は用意されている）。承認したときに報酬を付けるのか、付けるなら額を誰が決めるのかは未確定です。

---

## 6. ストア

| 言葉 | このアプリでの意味 | コード上の名前 | 混同しやすいこと・未確定の点 |
| --- | --- | --- | --- |
| 商品 | 家庭内通貨と交換できるもの（ゲーム時間の延長券など） | `StoreItem` | `ChildStoreScreen` はライブ接続時、実データを取得する（`useStoreItems`） |
| 価格 | その商品と交換するのに必要な額 | `StoreItem.price` | 過去の購入に、変更後の価格を適用しない扱いは未確定 |
| 在庫 | 交換できる残りの数 | `StoreItem.stock` | `purchase_store_item` が購入のたびに1減らす。無制限在庫は `UNLIMITED_STOCK`（999999）で表現する運用（減らない扱いではない点に注意） |
| 商品追加申請 | 子から親へ「この商品を置いてほしい」と申請するもの | `StoreItemRequest` / `store_item_requests` | 商品そのもの（`StoreItem`）とは別。**承認すると同一トランザクションで商品が自動作成される**（`approve_store_item_request`。価格は承認時に親が入力し、在庫は無制限扱い。[Issue #131](https://github.com/1R0U/my-home-bank/issues/131)） |
| 購入（交換） | 通貨を払って商品と交換すること | `purchase_store_item` / `store_purchase`（取引種別） | **実装済み。** 在庫を1減らし、購入者の残高を減額し、`store_purchase` として取引記録（`transactions`）に残す（[Issue #64](https://github.com/1R0U/my-home-bank/issues/64)） |

---

## 7. 人と役割

| 言葉 | このアプリでの意味 | コード上の名前 | 混同しやすいこと・未確定の点 |
| --- | --- | --- | --- |
| 利用者 | このアプリを使う一人 | `User` / `users` | |
| 役割 | 大人用画面か子供用画面か | `User.role`（`parent` / `child`） | 画面の出し分けに使う。**承認できるかどうかをDB側では検証していない** |
| 家族での立場 | 父・母・子のどれか | `OnboardingProfile.familyRole`（`father` / `mother` / `child`） | `User.role` とは別。登録時のプロフィール用 |
| 申請者 | 完了申請や商品追加申請を出した人 | `user_id` / `requested_by` / `reported_by` | 表ごとに列名が違う |
| 承認者 | 申請を承認・却下した人 | `approved_by` | 申請者と同じ人でも現在は拒否されない（要確認） |
| ゲストユーザー | 開発時に使う、あらかじめ作ってある利用者。大人・子供の2人 | `GUEST_USERS`（`lib/guestUsers.ts`） | `users` に実在する行なので、書き込みが実際に通る。IDは固定で、`npm run start:parent` / `start:child` がこの人としてログインする。**本番のDBにも入っている**（[Issue #211](https://github.com/1R0U/my-home-bank/issues/211)） |
| モックユーザー | 画面確認用の、DBに存在しない利用者 | `MOCK_USERS`（`constants/mockData.ts`） | IDが `user-parent-1` のようにUUIDでない。**そのIDで引く読み書き**（所持金・口座・履歴・設定、および全ての申請・承認）は行われずモック値に戻る。一方、クエスト一覧のように利用者を絞らない取得は実データのまま。ゲストユーザーとは別物 |
| 家庭 | 一つの家族のまとまり | （表がない。**1 Supabase プロジェクト＝1家庭**で運用する） | 家庭を識別する列も、家庭をまたいだ操作を制限する仕組みも無い。複数の家庭を1プロジェクトに同居させる場合は作り直しが要る（[Issue #208](https://github.com/1R0U/my-home-bank/issues/208)） |

---

## 8. 未確定・要確認の一覧

この文書を書く時点で、意味や仕様が決まっていないものです。

| 項目 | 決まっていないこと | 関連 |
| --- | --- | --- |
| 通貨の表記 | `¥` / `P` / `ポイント` のどれに統一するか | `formatYen` |
| 利率の期間 | `interest_rate` `loan_rate` が週利・月利・年利のどれか | |
| 利息 | 計算と付与の処理が未実装。端数の扱いも未定 | `bank_interest` |
| 金額の上限 | 残高・借入額の上限がない | `canBorrow` |
| 報酬額の確定時点 | 受注時・申請時・承認時のどれを使うか（現在は承認時） | `Quest.reward_amount` |
| 繰り返しクエスト | 同じクエストを毎日行う場合の数え方 | `Quest` / `QuestLog` |
| タスク報告の報酬 | 承認時に報酬を付けるか、額を誰が決めるか | `TaskReport` |
| 保有総量の呼び名 | 「お財布＋預金−借金」を画面で何と呼ぶか | |
| 本人の検証 | 誰が承認できるかをDB側で検証していない | [Issue #24](https://github.com/1R0U/my-home-bank/issues/24) |
| `quests.description` の必須 | DBはNULLを許すが、`types/index.ts` の `Quest` 型は `description: string` でNULLを想定していない | [Issue #186](https://github.com/1R0U/my-home-bank/issues/186) |
| `quests.created_by` の必須 | DBはNULLを許す。作成者が不明なクエストを許容する仕様か未確定 | [Issue #186](https://github.com/1R0U/my-home-bank/issues/186) |
| マイグレーション履歴 | 稼働中のDBには適用履歴が1件も記録されておらず、`supabase db push` が使えない状態 | [Issue #182](https://github.com/1R0U/my-home-bank/issues/182) |
