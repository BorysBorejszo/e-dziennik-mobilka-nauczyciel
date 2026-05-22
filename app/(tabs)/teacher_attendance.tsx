import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
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
    AttendanceStatus,
    getAttendanceStatuses,
    getClasses,
    getLessonHours,
    getStudentsByClass,
    LessonHour,
    markAttendance,
    SchoolClass,
    Student,
} from "../api/teacher";
import ErrorState from "../components/ErrorState";
import Header from "../components/Header";
import { R, S, T, cardShadow, getEditorialPalette } from "../theme/editorial";
import { useTheme } from "../theme/ThemeContext";

export default function TeacherAttendance() {
    const { theme } = useTheme();
    const palette = getEditorialPalette(theme);
    const shadow = cardShadow(theme);

    const [classes, setClasses] = useState<SchoolClass[]>([]);
    const [statuses, setStatuses] = useState<AttendanceStatus[]>([]);
    const [lessonHours, setLessonHours] = useState<LessonHour[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    const [selectedClass, setSelectedClass] = useState<SchoolClass | null>(null);
    const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
    const [selectedHour, setSelectedHour] = useState<LessonHour | null>(null);

    const [students, setStudents] = useState<Student[]>([]);
    const [loadingStudents, setLoadingStudents] = useState(false);
    // map: student.id → status.id (undefined = not set)
    const [statusMap, setStatusMap] = useState<Record<number, number | undefined>>({});

    const [submitting, setSubmitting] = useState(false);
    const [savedIds, setSavedIds] = useState<Set<number>>(new Set());

    const load = async () => {
        setFetchError(null);
        try {
            const [cls, st, lh] = await Promise.all([
                getClasses(),
                getAttendanceStatuses(),
                getLessonHours(),
            ]);
            setClasses(cls);
            setStatuses(st);
            setLessonHours(lh);
        } catch (err) {
            setFetchError(err instanceof Error ? err.message : 'Nie udało się pobrać danych.');
        }
    };

    useEffect(() => { void load(); }, [reloadKey]);

    const onRefresh = async () => {
        setRefreshing(true);
        await load();
        if (selectedClass) await loadStudents(selectedClass);
        setRefreshing(false);
    };

    const loadStudents = async (cls: SchoolClass) => {
        setLoadingStudents(true);
        setStudents([]);
        setStatusMap({});
        setSavedIds(new Set());
        const list = await getStudentsByClass(cls.id);
        setStudents(list);
        // Pre-select first status (usually "Obecny") for all students
        if (statuses.length > 0) {
            const defaultId = statuses[0].id;
            const map: Record<number, number> = {};
            list.forEach(s => { map[s.id] = defaultId; });
            setStatusMap(map);
        }
        setLoadingStudents(false);
    };

    const handleClassSelect = (cls: SchoolClass) => {
        setSelectedClass(cls);
        void loadStudents(cls);
    };

    const setStudentStatus = (studentId: number, statusId: number) => {
        setStatusMap(prev => ({ ...prev, [studentId]: statusId }));
    };

    const handleSaveAll = async () => {
        if (!selectedClass) { Alert.alert("Błąd", "Wybierz klasę."); return; }
        if (!date) { Alert.alert("Błąd", "Podaj datę."); return; }
        if (students.length === 0) { Alert.alert("Błąd", "Brak uczniów w klasie."); return; }

        const unset = students.filter(s => statusMap[s.id] === undefined);
        if (unset.length > 0) {
            Alert.alert(
                "Niezaznaczone",
                `${unset.length} uczniów nie ma zaznaczonego statusu. Kontynuować?`,
                [
                    { text: "Anuluj", style: "cancel" },
                    { text: "Zapisz zaznaczonych", onPress: () => void doSave() },
                ],
            );
            return;
        }
        await doSave();
    };

    const doSave = async () => {
        setSubmitting(true);
        let ok = 0;
        let fail = 0;
        const newSaved = new Set(savedIds);

        for (const student of students) {
            const statusId = statusMap[student.id];
            if (statusId === undefined) continue;
            const result = await markAttendance({
                uczen: student.id,
                data: date,
                status: statusId,
                godzina_lekcyjna: selectedHour?.id,
            });
            if (result) {
                ok++;
                newSaved.add(student.id);
            } else {
                fail++;
            }
        }

        setSavedIds(newSaved);
        setSubmitting(false);

        if (fail === 0) {
            Alert.alert("Sukces", `Zapisano frekwencję dla ${ok} uczniów.`);
        } else {
            Alert.alert("Częściowy sukces", `Zapisano: ${ok}, błąd: ${fail}.`);
        }
    };

    const studentName = (s: Student) =>
        `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || s.username || `#${s.id}`;

    const statusColor = (s: AttendanceStatus) => {
        const name = (s.nazwa ?? s.skrot ?? "").toLowerCase();
        if (name.includes("obecn") || name === "ob") return palette.success;
        if (name.includes("nieob") || name === "nb") return palette.danger;
        if (name.includes("spóźn") || name.includes("sp")) return palette.warning;
        return palette.info;
    };

    const statusLabel = (s: AttendanceStatus) =>
        s.skrot ?? s.nazwa?.slice(0, 3) ?? "?";

    const savedCount = students.filter(s => savedIds.has(s.id)).length;
    const readyCount = students.filter(s => statusMap[s.id] !== undefined).length;

    if (fetchError !== null) {
        return (
            <View style={[styles.root, { backgroundColor: palette.background }]}>
                <Header title="Frekwencja" subtitle="Wybierz klasę" />
                <ErrorState message={fetchError} onRetry={() => setReloadKey(k => k + 1)} />
            </View>
        );
    }

    return (
        <View style={[styles.root, { backgroundColor: palette.background }]}>
            <Header
                title="Frekwencja"
                subtitle={selectedClass ? `Klasa ${selectedClass.nazwa}` : "Wybierz klasę"}
            />
            <ScrollView
                style={{ flex: 1 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.content}
            >
                <View style={styles.body}>

                    {/* Class picker */}
                    <Text style={[T.eyebrow, styles.sectionLabel, { color: palette.textSoft }]}>
                        KLASA
                    </Text>
                    <View style={styles.classChips}>
                        {classes.map(cls => {
                            const active = selectedClass?.id === cls.id;
                            return (
                                <TouchableOpacity
                                    key={cls.id}
                                    onPress={() => handleClassSelect(cls)}
                                    activeOpacity={0.8}
                                    style={[
                                        styles.classChip,
                                        {
                                            backgroundColor: active ? palette.primary : palette.surface,
                                            borderColor: active ? palette.primary : palette.outline,
                                        },
                                        !active && shadow,
                                    ]}
                                >
                                    <Text style={[T.labelBold, { color: active ? palette.onPrimary : palette.text }]}>
                                        {cls.nazwa}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                        {classes.length === 0 && (
                            <Text style={[T.label, { color: palette.textMuted }]}>Brak klas</Text>
                        )}
                    </View>

                    {/* Date + hour */}
                    <Text style={[T.eyebrow, styles.sectionLabel, { color: palette.textSoft }]}>
                        DATA
                    </Text>
                    <View style={[styles.card, { backgroundColor: palette.surface }, shadow]}>
                        <TextInput
                            value={date}
                            onChangeText={setDate}
                            placeholder="RRRR-MM-DD"
                            placeholderTextColor={palette.textSoft}
                            style={[T.body, styles.dateInput, { color: palette.text }]}
                        />
                    </View>

                    {lessonHours.length > 0 && (
                        <>
                            <Text style={[T.eyebrow, styles.sectionLabel, { color: palette.textSoft }]}>
                                GODZINA LEKCYJNA (OPCJONALNIE)
                            </Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hourScroll}>
                                <View style={styles.hourRow}>
                                    {lessonHours.map(h => {
                                        const active = selectedHour?.id === h.id;
                                        return (
                                            <TouchableOpacity
                                                key={h.id}
                                                onPress={() => setSelectedHour(prev => prev?.id === h.id ? null : h)}
                                                activeOpacity={0.8}
                                                style={[
                                                    styles.hourChip,
                                                    { backgroundColor: active ? palette.primary : palette.surface },
                                                    !active && shadow,
                                                ]}
                                            >
                                                <Text style={[T.labelBold, { color: active ? palette.onPrimary : palette.text }]}>
                                                    {h.numer || h.id}
                                                </Text>
                                                {h.godzina_od ? (
                                                    <Text style={[T.meta, { color: active ? palette.onPrimary : palette.textSoft, marginTop: 2 }]}>
                                                        {h.godzina_od}
                                                    </Text>
                                                ) : null}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </ScrollView>
                        </>
                    )}

                    {/* Students list */}
                    {selectedClass && (
                        <>
                            <View style={styles.studentsHeader}>
                                <Text style={[T.eyebrow, { color: palette.textSoft }]}>
                                    UCZNIOWIE — {students.length} os.
                                </Text>
                                {students.length > 0 && (
                                    <Text style={[T.meta, { color: palette.textMuted }]}>
                                        {readyCount}/{students.length} zaznaczonych
                                        {savedCount > 0 ? ` · ${savedCount} zapisanych` : ""}
                                    </Text>
                                )}
                            </View>

                            {loadingStudents ? (
                                <View style={styles.loadingBox}>
                                    <ActivityIndicator color={palette.primary} />
                                    <Text style={[T.label, { color: palette.textSoft, marginTop: S[2] }]}>
                                        Ładowanie uczniów...
                                    </Text>
                                </View>
                            ) : students.length === 0 ? (
                                <View style={[styles.card, { backgroundColor: palette.surface }, shadow]}>
                                    <Text style={[T.label, { color: palette.textMuted, textAlign: "center", padding: S[4] }]}>
                                        Brak uczniów w tej klasie
                                    </Text>
                                </View>
                            ) : (
                                <View style={styles.studentList}>
                                    {students.map((student, idx) => {
                                        const currentStatusId = statusMap[student.id];
                                        const isSaved = savedIds.has(student.id);
                                        return (
                                            <View
                                                key={student.id}
                                                style={[
                                                    styles.studentRow,
                                                    { backgroundColor: palette.surface },
                                                    shadow,
                                                ]}
                                            >
                                                {/* Top row: index + name + active status badge */}
                                                <View style={styles.studentTopRow}>
                                                    <View style={[styles.indexBadge, { backgroundColor: palette.surfaceMid }]}>
                                                        <Text style={[T.meta, { color: palette.textMuted }]}>
                                                            {idx + 1}
                                                        </Text>
                                                    </View>
                                                    <Text style={[T.bodyMedium, styles.studentNameText, { color: palette.text }]} numberOfLines={1}>
                                                        {studentName(student)}
                                                    </Text>

                                                    {/* Prominent selected status */}
                                                    {currentStatusId !== undefined ? (() => {
                                                        const activeSt = statuses.find(s => s.id === currentStatusId);
                                                        const color = activeSt ? statusColor(activeSt) : palette.textSoft;
                                                        return (
                                                            <View style={[styles.activeStatusBadge, { backgroundColor: color }]}>
                                                                {isSaved && <Ionicons name="checkmark" size={12} color="#fff" style={{ marginRight: 3 }} />}
                                                                <Text style={[T.labelBold, { color: "#fff", fontSize: 13 }]}>
                                                                    {activeSt ? statusLabel(activeSt) : "—"}
                                                                </Text>
                                                            </View>
                                                        );
                                                    })() : (
                                                        <View style={[styles.activeStatusBadge, { backgroundColor: palette.surfaceMid }]}>
                                                            <Text style={[T.meta, { color: palette.textMuted }]}>—</Text>
                                                        </View>
                                                    )}
                                                </View>

                                                {/* Bottom row: selection chips */}
                                                <View style={styles.statusPills}>
                                                    {statuses.map(st => {
                                                        const active = currentStatusId === st.id;
                                                        const color = statusColor(st);
                                                        return (
                                                            <TouchableOpacity
                                                                key={st.id}
                                                                onPress={() => setStudentStatus(student.id, st.id)}
                                                                activeOpacity={0.8}
                                                                style={[
                                                                    styles.statusPill,
                                                                    {
                                                                        backgroundColor: active ? color + "22" : palette.surfaceLow,
                                                                        borderWidth: 1.5,
                                                                        borderColor: active ? color : palette.outlineVariant,
                                                                    },
                                                                ]}
                                                            >
                                                                <Text style={[
                                                                    T.meta,
                                                                    {
                                                                        color: active ? color : palette.textMuted,
                                                                        fontWeight: active ? "700" : "400",
                                                                    },
                                                                ]}>
                                                                    {statusLabel(st)}
                                                                </Text>
                                                            </TouchableOpacity>
                                                        );
                                                    })}
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                            )}
                        </>
                    )}

                    {!selectedClass && (
                        <View style={[styles.emptyHint, { backgroundColor: palette.surface }, shadow]}>
                            <Ionicons name="people-outline" size={32} color={palette.textSoft} />
                            <Text style={[T.bodyMedium, { color: palette.textMuted, marginTop: S[2] }]}>
                                Wybierz klasę powyżej
                            </Text>
                            <Text style={[T.label, { color: palette.textSoft, marginTop: S[1], textAlign: "center" }]}>
                                Pojawi się lista uczniów, dla których możesz zaznaczyć frekwencję
                            </Text>
                        </View>
                    )}
                </View>
            </ScrollView>

            {/* Save bar */}
            {selectedClass && students.length > 0 && (
                <View style={[styles.saveBar, { backgroundColor: palette.background }]}>
                    <TouchableOpacity
                        onPress={() => void handleSaveAll()}
                        disabled={submitting}
                        activeOpacity={0.85}
                        style={[
                            styles.saveBtn,
                            { backgroundColor: palette.primary, opacity: submitting ? 0.6 : 1 },
                        ]}
                    >
                        {submitting ? (
                            <ActivityIndicator color={palette.onPrimary} />
                        ) : (
                            <>
                                <Ionicons name="save-outline" size={18} color={palette.onPrimary} style={{ marginRight: S[2] }} />
                                <Text style={[T.labelBold, { color: palette.onPrimary }]}>
                                    Zapisz frekwencję ({readyCount}/{students.length})
                                </Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    content: { paddingBottom: 100 },
    body: {
        paddingHorizontal: S[4],
        paddingTop: S[2],
    },
    sectionLabel: {
        marginTop: S[5],
        marginBottom: S[2],
    },
    classChips: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: S[2],
    },
    classChip: {
        borderRadius: R.full,
        borderWidth: 1,
        paddingHorizontal: S[4],
        paddingVertical: S[2],
    },
    card: {
        borderRadius: R.lg,
        paddingHorizontal: S[4],
        paddingVertical: S[3],
    },
    dateInput: {
        padding: 0,
        margin: 0,
    },
    hourScroll: {
        marginBottom: S[2],
    },
    hourRow: {
        flexDirection: "row",
        gap: S[2],
    },
    hourChip: {
        borderRadius: R.md,
        paddingHorizontal: S[3],
        paddingVertical: S[2],
        alignItems: "center",
        minWidth: 52,
    },
    studentsHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: S[5],
        marginBottom: S[2],
    },
    loadingBox: {
        alignItems: "center",
        paddingVertical: S[8],
    },
    studentList: {
        gap: S[2],
    },
    studentRow: {
        borderRadius: R.lg,
        padding: S[3],
        gap: S[2],
    },
    studentTopRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: S[2],
    },
    indexBadge: {
        width: 28,
        height: 28,
        borderRadius: R.full,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    studentNameText: {
        flex: 1,
    },
    activeStatusBadge: {
        flexDirection: "row",
        alignItems: "center",
        borderRadius: R.md,
        paddingHorizontal: S[3],
        paddingVertical: S[1] + 2,
        flexShrink: 0,
        minWidth: 44,
        justifyContent: "center",
    },
    statusPills: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: S[1] + 2,
        paddingLeft: 28 + S[2],
    },
    statusPill: {
        borderRadius: R.sm,
        paddingHorizontal: S[2] + 2,
        paddingVertical: S[1] + 1,
    },
    emptyHint: {
        borderRadius: R.lg,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: S[8],
        paddingHorizontal: S[6],
        marginTop: S[6],
    },
    saveBar: {
        paddingHorizontal: S[4],
        paddingBottom: S[4],
        paddingTop: S[2],
    },
    saveBtn: {
        height: 56,
        borderRadius: R.full,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
    },
});
