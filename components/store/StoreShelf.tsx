import { Image, Pressable, Text, View } from "react-native";
import type { StoreItem } from "../../types";
import { storeStyles as styles } from "./storeStyles";
import { ITEMS_PER_SHELF } from "./splitIntoShelves";

function PriceTag({ price }: { price: number }) {
  return (
    <View style={styles.priceTag}>
      <View style={styles.tagHole} />
      <Text style={styles.priceText}>{price.toLocaleString("ja-JP")}</Text>
      <Text style={styles.pointUnit}> P</Text>
    </View>
  );
}

type StoreItemCardProps = {
  item: StoreItem;
  onPress?: (itemId: string) => void;
};

function StoreItemCard({ item, onPress }: StoreItemCardProps) {
  const content = (
    <>
      <View style={styles.imageFrame}>
        {item.image_url ? (
          <Image
            accessibilityIgnoresInvertColors
            resizeMode="cover"
            source={{ uri: item.image_url }}
            style={styles.itemImage}
          />
        ) : (
          <View style={styles.itemImagePlaceholder} />
        )}
        <View style={styles.imageShine} />
      </View>
      <PriceTag price={item.price} />
      <Text numberOfLines={2} style={styles.itemTitle}>
        {item.title}
      </Text>
    </>
  );

  if (!onPress) {
    return (
      <View
        accessible
        accessibilityLabel={`${item.title}、${item.price.toLocaleString("ja-JP")}ポイント`}
        style={styles.itemCard}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityHint="タップして購入画面を開きます"
      accessibilityLabel={`${item.title}、${item.price.toLocaleString("ja-JP")}ポイント`}
      accessibilityRole="button"
      onPress={() => onPress(item.id)}
      style={styles.itemCard}
    >
      {content}
    </Pressable>
  );
}

type StoreShelfProps = {
  items: StoreItem[];
  onSelectItem?: (itemId: string) => void;
};

export default function StoreShelf({ items, onSelectItem }: StoreShelfProps) {
  return (
    <View style={styles.shelfSection}>
      <View style={styles.itemsRow}>
        {items.map((item) => (
          <StoreItemCard item={item} key={item.id} onPress={onSelectItem} />
        ))}
        {Array.from({ length: ITEMS_PER_SHELF - items.length }).map((_, index) => (
          <View key={`empty-${index}`} style={styles.itemCard} />
        ))}
      </View>
      <View style={styles.shelfTop} />
      <View style={styles.shelfFront}>
        <View style={styles.woodGrain} />
        <View style={[styles.woodGrain, styles.woodGrainSecond]} />
      </View>
      <View style={styles.shelfShadow} />
    </View>
  );
}
