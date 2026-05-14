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
    AttendanceEntry,
    AttendanceStatus,
    getAttendanceForStudent,
    getAttendanceStatuses,
    getLessonHours,
    getStudents,
    LessonHour,
    markAttendance,
    Student,
} from "../api/teacher";
import Header from "../components/Header";
import { R, S, T, cardShadow, getEditorialPalette } from "../theme/editorial";
import { useTheme } from "../theme/ThemeContext";

export default function TeacherAttendance() {
    const { theme } = useTheme();
    const palette = getEditorialPalette(theme);
    const shadow = cardShadow(theme);

    const [students, setStudents] = useState<Student[]>([]);
    const [statuses, setStatuses] = useState<AttendanceStatus[]>([]);
    const [lessonHours, setLessonHours] = useState<LessonHour[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [selectedStatus, setSelectedStatus] = useState<AttendanceStatus | null>(null);
    const [selectedHour, setSelectedHour] = useState<LessonHour | null>(null);
    const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
    const [studentSearch, setStudentSearch] = useState("");
    const [showStudentPicker, setShowStudentPicker] = useState(false);
    const [recentEntries, setRecentEntries] = useState<AttendanceEntry[]>([]);

    const load = async () => {
        const [s, st, lh] = await Promise.all([
            getStudents(),
            getAttendanceStatuses(),
            getLessonHours(),
        ]);
        setStudents(s);
        setStatuses(st);
        setLessonHours(lh);
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
        const entries = await getAttendanceForStudent(s.id);
        setRecentEntries(entries.slice(0, 15));
    };

    const handleSubmit = async () => {
        if (!selectedStudent) { Alert.alert("Błąd", "Wybierz ucznia"); return; }
        if (!date) { Alert.alert("Błąd", "Podaj datę"); return; }

        setSubmitting(true);
        const entry: AttendanceEntry = {
            uczen: selectedStudent.id,
            data: date,
            status: selectedStatus?.id,
            godzina_lekcyjna: selectedHour?.id,
        };
        const ok = await markAttendance(entry);
        setSubmitting(false);

        if (ok) {
            Alert.alert("Sukces", `Frekwencja zapisana dla ${studentName(selectedStudent)}`);
            const entries = await getAttendanceForStudent(selectedStudent.id);
            setRecentEntries(entries.slice(0, 15));
        } else {
            Alert.alert("Błąd", "Nie udało się zapisać frekwencji");
        }
    };

    const statusColor = (s: AttendanceStatus) => {
        const name = s.nazwa?.toLowerCase() ?? s.skrot?.toLowerCase() ?? "";
        if (name.includes("obecn") || name === "ob") return palette.success;
        if (name.includes("nieob") || name === "nb") return palette.danger;
        if (name.includes("spóźn") || name.includes("sp")) return palette.warning;
        return palette.info;
    };

    return (
        <View style={[styles.root, { backgroundColor: palette.background }]}>
            <Header title="Frekwencja" subtitle="Zaznacz obecność ucznia" />
            <ScrollView
                style={{ flex: 1 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >

            <View style={styles.body}>
                {/* Section header */}
                <View style={styles.sectionHeader}>
                    <Text style={[T.eyebrow, { color: palette.textSoft }]}>NOWY WPIS FREKWENCJI</Text>
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

                    {/* Date */}
                    <Text style={[T.labelBold, styles.fieldLabel, { color: palette.textSoft }]}>
                        Data (RRRR-MM-DD)
                    </Text>
                    <TextInput
                        value={date}
                        onChangeText={setDate}
                        placeholder="2024-01-15"
                        placeholderTextColor={palette.textSoft}
                        style={[styles.textInput, { backgroundColor: palette.inputSurface, color: palette.text }]}
                    />

                    <View style={styles.gap} />

                    {/* Status pills */}
                    <Text style={[T.labelBold, styles.fieldLabel, { color: palette.textSoft }]}>
                        Status obecności
                    </Text>
                    <View style={styles.pillRow}>
                        {statuses.map(s => {
                            const active = selectedStatus?.id === s.id;
                            const color = statusColor(s);
                            return (
                                <TouchableOpacity
                                    key={s.id}
                                    onPress={() => setSelectedStatus(s)}
                                    style={[
                                        styles.statusPill,
                                        {
                                            backgroundColor: active ? color : palette.inputSurface,
                                        },
                                    ]}
                                >
                                    <Text style={[T.labelBold, { color: active ? "#fff" : palette.text }]}>
                                        {s.skrot ?? s.nazwa}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                        {statuses.length === 0 && (
                            <Text style={[T.label, { color: palette.textMuted }]}>Brak statusów</Text>
                        )}
                    </View>

                    {/* Lesson hours */}
                    {lessonHours.length > 0 && (
                        <>
                            <View style={styles.gap} />
                            <Text style={[T.labelBold, styles.fieldLabel, { color: palette.textSoft }]}>
                                Godzina lekcyjna (opcjonalnie)
                            </Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                <View style={styles.hourRow}>
                                    {lessonHours.map(h => {
                                        const active = selectedHour?.id === h.id;
                                        return (
                                            <TouchableOpacity
                                                key={h.id}
                                                onPress={() => setSelectedHour(prev => prev?.id === h.id ? null : h)}
                                                style={[
                                                    styles.hourChip,
                                                    {
                                                        backgroundColor: active ? palette.primary : palette.inputSurface,
                                                    },
                                                ]}
                                            >
                                                <Text style={[T.meta, { color: active ? palette.onPrimary : palette.text }]}>
                                                    {h.numer}. {h.godzina_od}–{h.godzina_do}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </ScrollView>
                        </>
                    )}

                    <View style={styles.gapLg} />

                    {/* Submit */}
                    <TouchableOpacity
                        onPress={handleSubmit}
                        disabled={submitting}
                        style={[styles.submitBtn, { backgroundColor: palette.primary, opacity: submitting ? 0.6 : 1 }]}
                    >
                        <Text style={[T.labelBold, { color: palette.onPrimary, fontSize: 15 }]}>
                            {submitting ? "Zapisywanie..." : "Zapisz frekwencję"}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Recent entries */}
                {recentEntries.length > 0 && (
                    <>
                        <View style={styles.sectionHeader}>
                            <Text style={[T.eyebrow, { color: palette.textSoft }]}>
                                HISTORIA — {selectedStudent ? studentName(selectedStudent).toUpperCase() : ''}
                            </Text>
                        </View>

                        {recentEntries.map((e, i) => {
                            const st = statuses.find(s => s.id === e.status);
                            const color = st ? statusColor(st) : palette.textSoft;
                            return (
                                <View
                                    key={e.id ?? i}
                                    style={[styles.historyRow, { backgroundColor: palette.surface }, shadow]}
                                >
                                    <View style={[styles.historyBadge, { backgroundColor: color }]}>
                                        <Text style={[T.meta, { color: "#fff" }]}>
                                            {st?.skrot ?? "?"}
                                        </Text>
                                    </View>
                                    <View style={styles.historyContent}>
                                        <Text style={[T.bodyMedium, { color: palette.text }]}>{e.data}</Text>
                                        {st ? (
                                            <Text style={[T.label, { color: palette.textMuted, marginTop: 2 }]}>
                                                {st.nazwa}
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
    textInput: {
        borderRadius: R.md,
        paddingHorizontal: S[3],
        paddingVertical: S[3],
        fontSize: 15,
    },
    pillRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: S[2],
    },
    statusPill: {
        paddingHorizontal: S[3],
        paddingVertical: S[2] + 2,
        borderRadius: R.md,
    },
    hourRow: {
        flexDirection: "row",
        gap: S[2],
    },
    hourChip: {
        paddingHorizontal: S[3],
        paddingVertical: S[2],
        borderRadius: R.md,
    },
    gap: {
        height: S[4],
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
    historyRow: {
        flexDirection: "row",
        alignItems: "center",
        borderRadius: R.lg,
        padding: S[3],
        marginBottom: S[2],
        gap: S[3],
    },
    historyBadge: {
        width: 36,
        height: 36,
        borderRadius: R.md,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    historyContent: {
        flex: 1,
    },
});
