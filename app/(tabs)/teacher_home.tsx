import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Header from "../components/Header";
import { useUser } from "../context/UserContext";
import { R, S, T, cardShadow, getEditorialPalette } from "../theme/editorial";
import { useTheme } from "../theme/ThemeContext";

type QuickTile = {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    tab: number;
};

type Props = {
    onNavigate?: (tabIndex: number) => void;
};

export default function TeacherHome({ onNavigate }: Props) {
    const { user: userData } = useUser();
    const { theme } = useTheme();
    const palette = getEditorialPalette(theme);
    const shadow = cardShadow(theme);

    const rawName = userData?.name?.toString() ?? "";
    const firstName = rawName.split(/[_\s]+/)[0] ?? "Nauczycielu";
    const displayName = firstName
        ? firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase()
        : "Nauczycielu";

    const today = new Date().toLocaleDateString("pl-PL", {
        weekday: "long",
        day: "numeric",
        month: "long",
    });

    const tiles: QuickTile[] = [
        { label: "Plan lekcji", icon: "calendar-outline", color: palette.primary, tab: 1 },
        { label: "Wystaw ocenę", icon: "ribbon-outline", color: palette.success, tab: 2 },
        { label: "Zachowanie", icon: "star-outline", color: palette.warning, tab: 4 },
        { label: "Frekwencja", icon: "stats-chart-outline", color: palette.info, tab: 3 },
        { label: "Wiadomości", icon: "chatbubble-outline", color: "#8b5cf6", tab: 5 },
        { label: "Ogłoszenia", icon: "megaphone-outline", color: "#f97316", tab: 6 },
    ];

    return (
        <View style={[styles.root, { backgroundColor: palette.background }]}>
            <Header title={`Witaj, ${displayName}`} subtitle={today} />
            <ScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.content}
            >

            <View style={styles.body}>
                {/* Quick access section */}
                <Text style={[T.title, styles.sectionTitle, { color: palette.text }]}>
                    Szybki dostęp
                </Text>

                <View style={styles.tilesGrid}>
                    {tiles.map((tile) => (
                        <TouchableOpacity
                            key={tile.tab}
                            activeOpacity={0.78}
                            onPress={() => onNavigate?.(tile.tab)}
                            style={[styles.tile, { backgroundColor: palette.surface }, shadow]}
                        >
                            <View
                                style={[
                                    styles.tileIcon,
                                    { backgroundColor: tile.color + "1e", borderRadius: R.md },
                                ]}
                            >
                                <Ionicons name={tile.icon} size={22} color={tile.color} />
                            </View>
                            <Text style={[T.bodyMedium, styles.tileLabel, { color: palette.text }]}>
                                {tile.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Info card */}
                <View style={[styles.infoCard, { backgroundColor: palette.surface }, shadow]}>
                    <View style={styles.infoHeader}>
                        <View
                            style={[
                                styles.infoIconWrap,
                                { backgroundColor: palette.primaryFixed, borderRadius: R.md },
                            ]}
                        >
                            <Ionicons name="information-circle-outline" size={18} color={palette.primary} />
                        </View>
                        <Text style={[T.labelBold, { color: palette.textMuted }]}>Informacje</Text>
                    </View>
                    <Text style={[T.label, styles.infoBody, { color: palette.textSoft }]}>
                        Jesteś zalogowany jako nauczyciel. Masz dostęp do wystawiania ocen, zarządzania frekwencją, wpisywania punktów zachowania oraz sprawdzania planu lekcji.
                    </Text>
                </View>
            </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    content: {
        paddingBottom: 120,
    },
    body: {
        paddingHorizontal: S[4],
        paddingTop: S[2],
    },
    sectionTitle: {
        marginBottom: S[3],
    },
    tilesGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: S[3],
        marginBottom: S[6],
    },
    tile: {
        width: "47%",
        borderRadius: R.lg,
        padding: S[4],
        alignItems: "flex-start",
    },
    tileIcon: {
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: S[3],
    },
    tileLabel: {
        lineHeight: 20,
    },
    infoCard: {
        borderRadius: R.lg,
        padding: S[4],
    },
    infoHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: S[2],
        marginBottom: S[2],
    },
    infoIconWrap: {
        width: 32,
        height: 32,
        alignItems: "center",
        justifyContent: "center",
    },
    infoBody: {
        lineHeight: 20,
    },
});
