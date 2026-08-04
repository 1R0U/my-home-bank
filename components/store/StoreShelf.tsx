import { Image, Text, View } from "react-native";
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

function StoreItemCard({ item }: { item: StoreItem }) {
  return (
    <View
      accessible
      accessibilityLabel={`${item.title}、${item.price.toLocaleString("ja-JP")}ポイント`}
      style={styles.itemCard}
    >
      <View style={styles.imageFrame}>
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          source={{ uri: item.image_url }}
          style={styles.itemImage}
        />
        <View style={styles.imageShine} />
      </View>
      <PriceTag price={item.price} />
      <Text numberOfLines={2} style={styles.itemTitle}>
        {item.title}
      </Text>
    </View>
  );
}

export default function StoreShelf({ items }: { items: StoreItem[] }) {
  return (
    <View style={styles.shelfSection}>
      <View style={styles.itemsRow}>
        {items.map((item) => (
          <StoreItemCard item={item} key={item.id} />
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
