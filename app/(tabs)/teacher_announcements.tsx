import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import * as React from "react";
import {
    Alert,
    FlatList,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import {
    Announcement,
    deleteAnnouncement,
    getAnnouncements,
} from "../api/announcements";
import {
    Card,
    EmptyPlaceholder,
    PrimaryButton,
    SectionHeader,
} from "../components/editorial/MobileBlocks";
import Header from "../components/Header";
import { SkeletonCard } from "../components/ui/SkeletonItem";
import UserGate from "../components/UserGate";
import { R, S, T, getEditorialPalette } from "../theme/editorial";
import { useTheme } from "../theme/ThemeContext";

export default function TeacherAnnouncements() {
    const router = useRouter();
    const { theme } = useTheme();
    const palette = getEditorialPalette(theme);

    const [announcements, setAnnouncements] = React.useState<Announcement[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [refreshing, setRefreshing] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const fetchAnnouncements = React.useCallback(async () => {
        setError(null);
        try {
            const data = await getAnnouncements();
            setAnnouncements(data);
        } catch {
            setError("Nie udało się pobrać ogłoszeń.");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    React.useEffect(() => {
        void fetchAnnouncements();
    }, [fetchAnnouncements]);

    const handleDelete = (item: Announcement) => {
        Alert.alert(
            "Usuń ogłoszenie",
            `Czy na pewno chcesz usunąć ogłoszenie „${item.tytul}"?`,
            [
                { text: "Anuluj", style: "cancel" },
                {
                    text: "Usuń",
                    style: "destructive",
                    onPress: async () => {
                        const ok = await deleteAnnouncement(item.id);
                        if (ok) {
                            setAnnouncements((prev) => prev.filter((a) => a.id !== item.id));
                        } else {
                            Alert.alert("Błąd", "Nie udało się usunąć ogłoszenia.");
                        }
                    },
                },
            ],
        );
    };

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString("pl-PL", {
            day: "numeric",
            month: "short",
            year: "numeric",
        });
    };

    const zasiegLabel = (item: Announcement) =>
        item.zasieg === "school" ? "Cała szkoła" : `Klasa (${item.klasy?.length ?? 0})`;

    const zasiegColor = (item: Announcement) =>
        item.zasieg === "school" ? palette.infoBg : palette.primaryFixed;

    const zasiegTextColor = (item: Announcement) =>
        item.zasieg === "school" ? palette.infoText : palette.primary;

    return (
        <UserGate>
            <View style={[styles.root, { backgroundColor: palette.background }]}>
                <Header title="Ogłoszenia" subtitle="Zarządzaj ogłoszeniami i ankietami" />

                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={styles.content}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => {
                                setRefreshing(true);
                                void fetchAnnouncements();
                            }}
                            tintColor={palette.primary}
                        />
                    }
                >
                    <View style={styles.body}>
                        <View style={styles.actionRow}>
                            <PrimaryButton
                                label="Nowe ogłoszenie"
                                onPress={() => router.push("/ogloszenia/nowe_ogloszenie")}
                                icon="megaphone-outline"
                                tone="primary"
                            />
                        </View>

                        <View style={styles.listSection}>
                            <SectionHeader
                                eyebrow="Lista"
                                title="Twoje ogłoszenia"
                                meta={String(announcements.length)}
                            />

                            {loading ? (
                                <View style={styles.skeletonList}>
                                    <SkeletonCard />
                                    <SkeletonCard />
                                    <SkeletonCard />
                                </View>
                            ) : error ? (
                                <EmptyPlaceholder
                                    title="Błąd pobierania"
                                    subtitle={error}
                                    icon="alert-circle-outline"
                                />
                            ) : announcements.length === 0 ? (
                                <EmptyPlaceholder
                                    title="Brak ogłoszeń"
                                    subtitle="Nowe ogłoszenia pojawią się tutaj po opublikowaniu."
                                    icon="megaphone-outline"
                                />
                            ) : (
                                <FlatList
                                    data={announcements}
                                    keyExtractor={(item) => String(item.id)}
                                    scrollEnabled={false}
                                    ItemSeparatorComponent={() => <View style={styles.separator} />}
                                    renderItem={({ item }) => (
                                        <Card>
                                            <View style={styles.cardInner}>
                                                {/* Header row */}
                                                <View style={styles.cardHeader}>
                                                    <View
                                                        style={[
                                                            styles.scopePill,
                                                            { backgroundColor: zasiegColor(item) },
                                                        ]}
                                                    >
                                                        <Ionicons
                                                            name={
                                                                item.zasieg === "school"
                                                                    ? "globe-outline"
                                                                    : "people-outline"
                                                            }
                                                            size={12}
                                                            color={zasiegTextColor(item)}
                                                        />
                                                        <Text
                                                            style={[
                                                                T.meta,
                                                                { color: zasiegTextColor(item), marginLeft: 4 },
                                                            ]}
                                                        >
                                                            {zasiegLabel(item)}
                                                        </Text>
                                                    </View>

                                                    {item.ankieta ? (
                                                        <View
                                                            style={[
                                                                styles.scopePill,
                                                                { backgroundColor: palette.successBg },
                                                            ]}
                                                        >
                                                            <Ionicons
                                                                name="bar-chart-outline"
                                                                size={12}
                                                                color={palette.successText}
                                                            />
                                                            <Text
                                                                style={[
                                                                    T.meta,
                                                                    { color: palette.successText, marginLeft: 4 },
                                                                ]}
                                                            >
                                                                Ankieta
                                                            </Text>
                                                        </View>
                                                    ) : null}

                                                    <TouchableOpacity
                                                        onPress={() => handleDelete(item)}
                                                        hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                                                        style={styles.deleteBtn}
                                                    >
                                                        <Ionicons
                                                            name="trash-outline"
                                                            size={18}
                                                            color={palette.danger}
                                                        />
                                                    </TouchableOpacity>
                                                </View>

                                                {/* Title */}
                                                <Text
                                                    style={[
                                                        T.bodyMedium,
                                                        { color: palette.text, marginTop: S[2] },
                                                    ]}
                                                    numberOfLines={2}
                                                >
                                                    {item.tytul}
                                                </Text>

                                                {/* Preview */}
                                                <Text
                                                    style={[
                                                        T.label,
                                                        { color: palette.textSoft, marginTop: S[1] },
                                                    ]}
                                                    numberOfLines={3}
                                                >
                                                    {item.tresc}
                                                </Text>

                                                {/* Footer */}
                                                <View style={styles.cardFooter}>
                                                    <Ionicons
                                                        name="time-outline"
                                                        size={12}
                                                        color={palette.textSoft}
                                                    />
                                                    <Text
                                                        style={[
                                                            T.meta,
                                                            { color: palette.textSoft, marginLeft: 4 },
                                                        ]}
                                                    >
                                                        {formatDate(item.data_publikacji)}
                                                    </Text>

                                                    {item.ankieta ? (
                                                        <Text
                                                            style={[
                                                                T.meta,
                                                                { color: palette.textMuted, marginLeft: S[3] },
                                                            ]}
                                                        >
                                                            {item.ankieta.response_count} odpowiedzi
                                                        </Text>
                                                    ) : null}
                                                </View>
                                            </View>
                                        </Card>
                                    )}
                                />
                            )}
                        </View>
                    </View>
                </ScrollView>
            </View>
        </UserGate>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    content: { paddingBottom: 120 },
    body: {
        paddingHorizontal: S[4],
        paddingTop: S[2],
    },
    actionRow: {
        marginBottom: S[4],
    },
    listSection: {
        marginTop: S[2],
    },
    skeletonList: {
        gap: S[3],
    },
    separator: {
        height: S[3],
    },
    cardInner: {
        padding: S[4],
    },
    cardHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: S[2],
    },
    scopePill: {
        flexDirection: "row",
        alignItems: "center",
        borderRadius: R.full,
        paddingHorizontal: S[2] + 2,
        paddingVertical: 4,
    },
    deleteBtn: {
        marginLeft: "auto",
        padding: 4,
    },
    cardFooter: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: S[3],
    },
});
