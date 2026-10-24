import { Pressable, Text, View } from "react-native";
import { formatNotificationTime, type AppNotification } from "../../lib/notifications";
import Furigana from "../Furigana";
import { NOTE_PIN_TOP, NOTICE_BOARD_COLORS, noticeBoardStyles as styles } from "./noticeBoardStyles";

/** 紙を少しずつ傾けて、手で留めた感じを出す（並び順で決め、描画のたびに変わらないようにする） */
const NOTE_TILTS = ["-1.2deg", "0.9deg", "-0.4deg", "1.3deg", "-0.8deg"];

type Props = {
  index: number;
  notification: AppNotification;
  onPress: (notification: AppNotification) => void;
};

/**
 * 子供用の掲示板に画びょうで留める、お知らせ1枚（Issue #441）。
 *
 * 未読は赤い画びょうと「あたらしい」のはんこ、既読は灰色の画びょうで少し日に焼けた紙にする。
 * 行き先があるお知らせには「みにいく」を添える。
 *
 * 紙は連続記録の紙（ChildStreakNote）と同じく `View` で描き、`Pressable` は押す操作だけを受け持つ（Issue #486）。
 * 紙を `Pressable` の `style`（関数）で描いていたとき、実機（iOS）で既読の紙の背景・ふち・影だけでなく
 * 余白（padding）まで当たっておらず、画びょうが題名に重なっていた。余白は半透明（opacity）では消えないので、
 * 紙のスタイルそのものが当たっていなかったと見ている。紙を `View` へ移すと実機で直った。
 * 関数の `style` を使う他の `Pressable` でも同じことが起きるかは、まだ確かめていない。
 */
export default function NoticeBoardNote({ index, notification, onPress }: Props) {
  const isUnread = notification.read_at === null;
  return (
    <Pressable
      accessibilityHint={notification.route ? "関係する画面を開きます" : undefined}
      accessibilityLabel={`${isUnread ? "未読。" : ""}${notification.title}`}
      accessibilityRole="button"
      // 画びょうは紙の上の辺から外へ出ているので、その分だけ押せる範囲を上へ広げる
      hitSlop={{ top: -NOTE_PIN_TOP }}
      onPress={() => onPress(notification)}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.note,
            !isUnread && styles.noteRead,
            { transform: [{ rotate: NOTE_TILTS[index % NOTE_TILTS.length] }] },
            pressed && styles.pressed,
          ]}
          testID="notice-board-note-paper"
        >
          <View
            style={[
              styles.pin,
              styles.notePin,
              { backgroundColor: isUnread ? NOTICE_BOARD_COLORS.pinRed : NOTICE_BOARD_COLORS.pinGray },
            ]}
            testID="notice-board-note-pin"
          >
            <View style={styles.pinShine} />
          </View>
          {isUnread ? (
            <View style={styles.stamp}>
              <Text style={styles.stampText}>あたらしい</Text>
            </View>
          ) : null}

          <Text style={[styles.noteTitle, !isUnread && styles.noteTitleRead]}>{notification.title}</Text>
          {notification.body ? <Text style={styles.noteBody}>{notification.body}</Text> : null}

          <View style={[styles.noteFooter, !isUnread && styles.noteFooterRead]}>
            <Text style={styles.noteTime}>{formatNotificationTime(notification.created_at)}</Text>
            {notification.route ? (
              <Furigana noWrap style={styles.noteGo}>
                {"{見|み}にいく ›"}
              </Furigana>
            ) : null}
          </View>
        </View>
      )}
    </Pressable>
  );
}
