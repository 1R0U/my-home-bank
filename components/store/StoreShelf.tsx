import { Image, Pressable, Text, View } from "react-native";
import type { StoreItem } from "../../types";
import { storeStyles as styles } from "./storeStyles";
import { ITEMS_PER_SHELF } from "./splitIntoShelves";
import { GOL_UNIT, formatAmount, formatGolForSpeech } from "../../lib/amount";

function PriceTag({ price }: { price: number }) {
  return (
    <View style={styles.priceTag}>
      <View style={styles.tagHole} />
      <Text style={styles.priceText}>{formatAmount(price)}</Text>
      <Text style={styles.golUnit}> {GOL_UNIT}</Text>
    </View>
  );
}

type StoreItemCardProps = {
  item: StoreItem;
  onSelect: (item: StoreItem) => void;
  selected: boolean;
};

function StoreItemCard({ item, onSelect, selected }: StoreItemCardProps) {
  return (
    <Pressable
      accessibilityLabel={`${item.title}、${formatGolForSpeech(item.price)}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => onSelect(item)}
      style={[styles.itemCard, selected && styles.itemCardSelected]}
    >
      <View style={[styles.imageFrame, selected && styles.imageFrameSelected]}>
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
    </Pressable>
  );
}

type StoreShelfProps = {
  items: StoreItem[];
  onSelectItem: (item: StoreItem) => void;
  selectedItemId: string | null;
};

export default function StoreShelf({ items, onSelectItem, selectedItemId }: StoreShelfProps) {
  return (
    <View style={styles.shelfSection}>
      <View style={styles.itemsRow}>
        {items.map((item) => (
          <StoreItemCard
            item={item}
            key={item.id}
            onSelect={onSelectItem}
            selected={item.id === selectedItemId}
          />
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
