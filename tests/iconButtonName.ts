/**
 * アイコン（Ionicons）付きのボタンを、表示している文字で探すための名前。
 *
 * RNTL v14 はボタンの名前を、中の文字をつなげて作る。Ionicons はアイコンを私用領域の1文字として
 * 描くので、名前にその文字も入る（例: 「家族の子供 」）。文字だけを渡すと一致しなくなり、
 * `queryByRole(...)).toBeNull()` が常に通ってしまう（Issue #493）。アイコンの1文字だけを前後に許す。
 */
export function iconButtonName(text: string): RegExp {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^(?:[\\uE000-\\uF8FF] )?${escaped}(?: [\\uE000-\\uF8FF])?$`);
}
