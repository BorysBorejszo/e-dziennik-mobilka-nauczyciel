import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useState } from "react";
import {
    Alert,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import {
    addBehaviorPoints,
    getBehaviorForStudent,
    BehaviorEntry,
    getStudents,
    Student,
} from "../api/teacher";
import Header from "../components/Header";
import { R, S, T, cardShadow, getEditorialPalette } from "../theme/editorial";
import { useTheme } from "../theme/ThemeContext";

const QUICK_POINTS = [-5, -3, -1, 1, 3, 5];

export default function TeacherBehavior() {
    const { theme } = useTheme();
    const palette = getEditorialPalette(theme);
    const shadow = cardShadow(theme);

    const [students, setStudents] = useState<Student[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [points, setPoints] = useState("");
    const [description, setDescription] = useState("");
    const [studentSearch, setStudentSearch] = useState("");
    const [showStudentPicker, setShowStudentPicker] = useState(false);
    const [recentEntries, setRecentEntries] = useState<BehaviorEntry[]>([]);

    const load = async () => {
        const s = await getStudents();
        setStudents(s);
    };

    useEffect(() => { load(); }, []);

    const onRefresh = async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    };

    const filteredStudents = students.filter(s => {
        const name = `${s.first_name ?? ''} ${s.last_name ?? ''} ${s.username ?? ''}`.toLowerCase();
        return name.includes(studentSearch.toLowerCase());
    });

    const studentName = (s: Student) =>
        `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || s.username || `#${s.id}`;

    const handleStudentSelect = async (s: Student) => {
        setSelectedStudent(s);
        setShowStudentPicker(false);
        setStudentSearch("");
        const entries = await getBehaviorForStudent(s.id);
        setRecentEntries(entries.slice(0, 10));
    };

    const handleSubmit = async () => {
        const numPoints = parseInt(points);
        if (!selectedStudent) { Alert.alert("Błąd", "Wybierz ucznia"); return; }
        if (!points || isNaN(numPoints)) { Alert.alert("Błąd", "Podaj liczbę punktów"); return; }
        if (!description.trim()) { Alert.alert("Błąd", "Podaj opis wpisu"); return; }

        setSubmitting(true);
        const ok = await addBehaviorPoints({
            uczen: selectedStudent.id,
            punkty: numPoints,
            opis: description,
        });
        setSubmitting(false);

        if (ok) {
            Alert.alert(
                "Sukces",
                `Zapisano ${numPoints > 0 ? "+" : ""}${numPoints} pkt dla ${studentName(selectedStudent)}`
            );
            setPoints("");
            setDescription("");
            const entries = await getBehaviorForStudent(selectedStudent.id);
            setRecentEntries(entries.slice(0, 10));
        } else {
            Alert.alert("Błąd", "Nie udało się zapisać punktów");
        }
    };

    const pointsNum = parseInt(points) || 0;
    const pointColor = pointsNum > 0 ? palette.success : pointsNum < 0 ? palette.danger : palette.textSoft;

    return (
        <View style={[styles.root, { backgroundColor: palette.background }]}>
            <Header title="Zachowanie" subtitle="Dodaj punkty zachowania" />
            <ScrollView
                style={{ flex: 1 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >

            <View style={styles.body}>
                {/* Section header */}
                <View style={styles.sectionHeader}>
                    <Text style={[T.eyebrow, { color: palette.textSoft }]}>NOWY WPIS</Text>
                </View>

                {/* Form card */}
                <View style={[styles.card, { backgroundColor: palette.surface }, shadow]}>

                    {/* Student picker */}
                    <Text style={[T.labelBold, styles.fieldLabel, { color: palette.textSoft }]}>Uczeń</Text>
                    <TouchableOpacity
                        style={[styles.selector, { backgroundColor: palette.inputSurface }]}
                        onPress={() => setShowStudentPicker(v => !v)}
                    >
                        <Text style={[T.body, { color: selectedStudent ? palette.text : palette.textSoft, flex: 1 }]}>
                            {selectedStudent ? studentName(selectedStudent) : "Wybierz ucznia..."}
                        </Text>
                        <Ionicons
                            name={showStudentPicker ? "chevron-up" : "chevron-down"}
                            size={18}
                            color={palette.textSoft}
                        />
                    </TouchableOpacity>

                    {showStudentPicker && (
                        <View style={styles.dropdown}>
                            <TextInput
                                value={studentSearch}
                                onChangeText={setStudentSearch}
                                placeholder="Szukaj ucznia..."
                                placeholderTextColor={palette.textSoft}
                                style={[styles.searchInput, { backgroundColor: palette.inputSurface, color: palette.text }]}
                            />
                            <View style={styles.dropdownList}>
                                <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                                    {filteredStudents.map(s => (
                                        <TouchableOpacity
                                            key={s.id}
                                            style={[
                                                styles.dropdownItem,
                                                selectedStudent?.id === s.id && { backgroundColor: palette.primaryFixed },
                                            ]}
                                            onPress={() => handleStudentSelect(s)}
                                        >
                                            <Text style={[T.body, { color: palette.text }]}>
                                                {studentName(s)}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                    {filteredStudents.length === 0 && (
                                        <Text style={[T.label, styles.emptyMsg, { color: palette.textMuted }]}>
                                            Brak wyników
                                        </Text>
                                    )}
                                </ScrollView>
                            </View>
                        </View>
                    )}

                    <View style={styles.gap} />

                    {/* Quick point buttons */}
                    <Text style={[T.labelBold, styles.fieldLabel, { color: palette.textSoft }]}>
                        Szybki wybór punktów
                    </Text>
                    <View style={styles.quickRow}>
                        {QUICK_POINTS.map(p => {
                            const active = String(p) === points;
                            const isPositive = p > 0;
                            const activeColor = isPositive ? palette.success : palette.danger;
                            return (
                                <TouchableOpacity
                                    key={p}
                                    onPress={() => setPoints(String(p))}
                                    style={[
                                        styles.quickChip,
                                        {
                                            backgroundColor: active ? activeColor : palette.inputSurface,
                                        },
                                    ]}
                                >
                                    <Text style={[
                                        T.labelBold,
                                        {
                                            fontSize: 15,
                                            color: active ? "#fff" : (isPositive ? palette.success : palette.danger),
                                        },
                                    ]}>
                                        {p > 0 ? `+${p}` : String(p)}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <View style={styles.gapSm} />

                    {/* Manual points input */}
                    <Text style={[T.labelBold, styles.fieldLabel, { color: palette.textSoft }]}>
                        Punkty (ręcznie)
                    </Text>
                    <TextInput
                        value={points}
                        onChangeText={setPoints}
                        keyboardType="numbers-and-punctuation"
                        placeholder="np. -3 lub 5"
                        placeholderTextColor={palette.textSoft}
                        style={[styles.textInput, { backgroundColor: palette.inputSurface, color: pointColor }]}
                    />

                    <View style={styles.gap} />

                    {/* Description */}
                    <Text style={[T.labelBold, styles.fieldLabel, { color: palette.textSoft }]}>
                        Opis wpisu
                    </Text>
                    <TextInput
                        value={description}
                        onChangeText={setDescription}
                        placeholder="Np. bójka na przerwie, pomoc kolegom..."
                        placeholderTextColor={palette.textSoft}
                        multiline
                        numberOfLines={3}
                        style={[styles.textInput, styles.textArea, { backgroundColor: palette.inputSurface, color: palette.text }]}
                    />

                    <View style={styles.gapLg} />

                    {/* Submit */}
                    <TouchableOpacity
                        onPress={handleSubmit}
                        disabled={submitting}
                        style={[styles.submitBtn, { backgroundColor: palette.primary, opacity: submitting ? 0.6 : 1 }]}
                    >
                        <Text style={[T.labelBold, { color: palette.onPrimary, fontSize: 15 }]}>
                            {submitting ? "Zapisywanie..." : "Dodaj wpis"}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Recent entries */}
                {recentEntries.length > 0 && (
                    <>
                        <View style={styles.sectionHeader}>
                            <Text style={[T.eyebrow, { color: palette.textSoft }]}>
                                OSTATNIE WPISY — {selectedStudent ? studentName(selectedStudent).toUpperCase() : ''}
                            </Text>
                        </View>

                        {recentEntries.map((e, i) => {
                            const pts = e.punkty ?? 0;
                            const isPos = pts >= 0;
                            const ptColor = isPos ? palette.success : palette.danger;
                            const ptBg = isPos ? palette.successBg : palette.dangerBg;

                            return (
                                <View
                                    key={e.id ?? i}
                                    style={[styles.entryRow, { backgroundColor: palette.surface }, shadow]}
                                >
                                    <View style={[styles.entryBadge, { backgroundColor: ptBg }]}>
                                        <Text style={[T.labelBold, { color: ptColor, fontSize: 15 }]}>
                                            {pts > 0 ? `+${pts}` : String(pts)}
                                        </Text>
                                    </View>
                                    <View style={styles.entryContent}>
                                        <Text style={[T.bodyMedium, { color: palette.text }]} numberOfLines={2}>
                                            {e.opis ?? "—"}
                                        </Text>
                                        {e.data ? (
                                            <Text style={[T.label, { color: palette.textMuted, marginTop: 2 }]}>
                                                {e.data}
                                            </Text>
                                        ) : null}
                                    </View>
                                </View>
                            );
                        })}
                    </>
                )}
            </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    body: {
        paddingHorizontal: S[4],
        paddingBottom: S[8],
    },
    sectionHeader: {
        paddingVertical: S[3],
    },
    card: {
        borderRadius: R.lg,
        padding: S[4],
        marginBottom: S[4],
    },
    fieldLabel: {
        marginBottom: S[1],
    },
    selector: {
        borderRadius: R.md,
        paddingHorizontal: S[3],
        paddingVertical: S[3],
        flexDirection: "row",
        alignItems: "center",
    },
    dropdown: {
        marginTop: S[2],
        borderRadius: R.md,
        overflow: "hidden",
    },
    dropdownList: {
        maxHeight: 200,
    },
    dropdownItem: {
        paddingHorizontal: S[3],
        paddingVertical: S[2] + 2,
        borderRadius: R.sm,
    },
    searchInput: {
        borderRadius: R.md,
        paddingHorizontal: S[3],
        paddingVertical: S[2] + 2,
        fontSize: 15,
        marginBottom: S[1],
    },
    emptyMsg: {
        textAlign: "center",
        padding: S[3],
    },
    quickRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: S[2],
    },
    quickChip: {
        paddingHorizontal: S[4],
        paddingVertical: S[2] + 2,
        borderRadius: R.md,
    },
    textInput: {
        borderRadius: R.md,
        paddingHorizontal: S[3],
        paddingVertical: S[3],
        fontSize: 15,
    },
    textArea: {
        minHeight: 80,
        textAlignVertical: "top",
    },
    gap: {
        height: S[4],
    },
    gapSm: {
        height: S[3],
    },
    gapLg: {
        height: S[5],
    },
    submitBtn: {
        borderRadius: R.full,
        height: 52,
        alignItems: "center",
        justifyContent: "center",
    },
    entryRow: {
        flexDirection: "row",
        alignItems: "center",
        borderRadius: R.lg,
        padding: S[3],
        marginBottom: S[2],
        gap: S[3],
    },
    entryBadge: {
        width: 52,
        height: 52,
        borderRadius: R.md,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    entryContent: {
        flex: 1,
    },
});
