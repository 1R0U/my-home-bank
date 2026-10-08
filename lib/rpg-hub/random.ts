/**
 * 決まった種から同じ並びを返す擬似乱数（xorshift32）。
 *
 * **マップは毎回同じでなければならない。** 起動のたびに町の周りが変わると目印にならず、
 * 「重なっていない」ことをテストで押さえることもできなくなる。
 * 町の外の自然物（mapObjects.ts）と、季節の地面の飾り（seasonalDecorations.ts）の両方で使う。
 * @param seed - 種
 * @returns 0以上1未満を返す関数
 */
export const createRandom = (seed: number) => {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
};
