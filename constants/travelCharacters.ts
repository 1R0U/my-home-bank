import type { ImageSourcePropType } from "react-native";
import type { CharacterType } from "../lib/rpg-hub/characterTypes";

/** 自分の色・装備の画像を待つ間の姿。同じモデルから撮影した画像を同梱する。 */
export const TRAVEL_CHARACTER_IMAGES: Record<CharacterType, ImageSourcePropType> = {
  cat: require("../assets/travel-characters/cat.png"),
  dog: require("../assets/travel-characters/dog.png"),
  frog: require("../assets/travel-characters/frog.png"),
  hamster: require("../assets/travel-characters/hamster.png"),
  panda: require("../assets/travel-characters/panda.png"),
  rabbit: require("../assets/travel-characters/rabbit.png"),
};
