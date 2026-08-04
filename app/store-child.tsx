import { Stack } from "expo-router";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MOCK_CURRENT_USER, MOCK_STORE_ITEMS } from "../constants/mockData";
import type { StoreItem } from "../types";

const ITEMS_PER_SHELF = 3;

function splitIntoShelves(items: StoreItem[]) {
  const shelves: StoreItem[][] = [];

  for (let index = 0; index < items.length; index += ITEMS_PER_SHELF) {
    shelves.push(items.slice(index, index + ITEMS_PER_SHELF));
  }

  return shelves;
}

function PriceTag({ price }: { price: number }) {
  return (
    <View style={styles.priceTag}>
      <View style={styles.tagHole} />
      <Text style={styles.priceText}>{price.toLocaleString()}</Text>
      <Text style={styles.pointUnit}> P</Text>
    </View>
  );
}

function StoreItemCard({ item }: { item: StoreItem }) {
  return (
    <Pressable
      accessibilityHint={`${item.price}ポイントで交換を申請します`}
      accessibilityLabel={item.title}
      accessibilityRole="button"
      style={({ pressed }) => [styles.itemCard, pressed && styles.itemPressed]}
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
    </Pressable>
  );
}

function WoodenShelf({ items }: { items: StoreItem[] }) {
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

export default function StoreChildScreen() {
  const shelves = splitIntoShelves(MOCK_STORE_ITEMS);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>MY HOME BANK</Text>
          <Text style={styles.screenTitle}>アイテムショップ</Text>
        </View>
        <View accessibilityLabel={`所持ポイント ${MOCK_CURRENT_USER.balance}`} style={styles.balanceBadge}>
          <Text style={styles.balanceLabel}>所持ポイント</Text>
          <View style={styles.balanceRow}>
            <View style={styles.coin}>
              <Text style={styles.coinText}>P</Text>
            </View>
            <Text style={styles.balanceValue}>{MOCK_CURRENT_USER.balance.toLocaleString()}</Text>
          </View>
        </View>
      </View>

      <View style={styles.shopFrame}>
        <View style={styles.frameRivetLeft} />
        <View style={styles.frameRivetRight} />
        <ScrollView
          contentContainerStyle={styles.shopContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.shopSign}>
            <Text style={styles.shopSignText}>ITEMS</Text>
            <Text style={styles.shopSubtext}>ほしい商品をえらぼう</Text>
          </View>

          {shelves.map((items, index) => (
            <WoodenShelf items={items} key={`shelf-${index}`} />
          ))}

          <Text style={styles.guideText}>商品をタップして交換を申請</Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#171220",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 14,
    paddingTop: 8,
  },
  eyebrow: {
    color: "#d6b66a",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
  },
  screenTitle: {
    color: "#fff8de",
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: 2,
  },
  balanceBadge: {
    backgroundColor: "#2a2135",
    borderColor: "#d6b66a",
    borderRadius: 18,
    borderWidth: 2,
    minWidth: 118,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  balanceLabel: {
    color: "#c7bca8",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },
  balanceRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 2,
  },
  coin: {
    alignItems: "center",
    backgroundColor: "#f2c94c",
    borderColor: "#fff0a6",
    borderRadius: 10,
    borderWidth: 1,
    height: 20,
    justifyContent: "center",
    marginRight: 6,
    width: 20,
  },
  coinText: {
    color: "#68440d",
    fontSize: 11,
    fontWeight: "900",
  },
  balanceValue: {
    color: "#fff8de",
    fontSize: 20,
    fontWeight: "900",
  },
  shopFrame: {
    backgroundColor: "#5b321f",
    borderColor: "#9b6338",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 5,
    flex: 1,
    marginHorizontal: 10,
    overflow: "hidden",
  },
  frameRivetLeft: {
    backgroundColor: "#d5a84d",
    borderColor: "#513018",
    borderRadius: 5,
    borderWidth: 1,
    height: 10,
    left: 9,
    position: "absolute",
    top: 9,
    width: 10,
    zIndex: 2,
  },
  frameRivetRight: {
    backgroundColor: "#d5a84d",
    borderColor: "#513018",
    borderRadius: 5,
    borderWidth: 1,
    height: 10,
    position: "absolute",
    right: 9,
    top: 9,
    width: 10,
    zIndex: 2,
  },
  shopContent: {
    backgroundColor: "#2b1b25",
    paddingBottom: 24,
    paddingHorizontal: 10,
    paddingTop: 16,
  },
  shopSign: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#d9b978",
    borderColor: "#6d3f24",
    borderRadius: 8,
    borderWidth: 3,
    marginBottom: 14,
    paddingHorizontal: 34,
    paddingVertical: 7,
    transform: [{ rotate: "-1deg" }],
  },
  shopSignText: {
    color: "#402416",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 4,
  },
  shopSubtext: {
    color: "#69462d",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 1,
  },
  shelfSection: {
    marginBottom: 22,
  },
  itemsRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 8,
    minHeight: 178,
    paddingHorizontal: 5,
  },
  itemCard: {
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    paddingTop: 4,
  },
  itemPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.97 }],
  },
  imageFrame: {
    backgroundColor: "#17121b",
    borderColor: "#d6b66a",
    borderRadius: 13,
    borderWidth: 2,
    elevation: 7,
    height: 96,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    width: "100%",
  },
  itemImage: {
    height: "100%",
    width: "100%",
  },
  imageShine: {
    backgroundColor: "rgba(255,255,255,0.16)",
    height: "120%",
    left: -18,
    position: "absolute",
    top: -35,
    transform: [{ rotate: "30deg" }],
    width: 28,
  },
  priceTag: {
    alignItems: "center",
    backgroundColor: "#f0d79c",
    borderColor: "#76502d",
    borderRadius: 4,
    borderWidth: 2,
    elevation: 4,
    flexDirection: "row",
    justifyContent: "center",
    marginTop: -7,
    minWidth: 68,
    paddingHorizontal: 9,
    paddingVertical: 4,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    transform: [{ rotate: "-2deg" }],
    zIndex: 2,
  },
  tagHole: {
    backgroundColor: "#684329",
    borderRadius: 2,
    height: 4,
    left: 5,
    position: "absolute",
    width: 4,
  },
  priceText: {
    color: "#442b1b",
    fontSize: 15,
    fontWeight: "900",
  },
  pointUnit: {
    color: "#74451d",
    fontSize: 11,
    fontWeight: "900",
  },
  itemTitle: {
    color: "#fff7dc",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 15,
    marginTop: 5,
    minHeight: 30,
    textAlign: "center",
  },
  shelfTop: {
    backgroundColor: "#a6683c",
    borderColor: "#d49a5d",
    borderTopWidth: 2,
    height: 9,
  },
  shelfFront: {
    backgroundColor: "#744126",
    borderBottomColor: "#3d2117",
    borderBottomWidth: 3,
    height: 22,
    overflow: "hidden",
  },
  woodGrain: {
    backgroundColor: "#945b33",
    borderRadius: 2,
    height: 3,
    left: 16,
    position: "absolute",
    top: 5,
    transform: [{ rotate: "-2deg" }],
    width: "44%",
  },
  woodGrainSecond: {
    left: undefined,
    right: 10,
    top: 13,
    transform: [{ rotate: "2deg" }],
    width: "32%",
  },
  shelfShadow: {
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
    height: 7,
    width: "92%",
  },
  guideText: {
    color: "#cbbd9f",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textAlign: "center",
  },
});
