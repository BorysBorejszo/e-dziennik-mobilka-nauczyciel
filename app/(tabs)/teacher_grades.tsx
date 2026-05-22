import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useRef, useState } from "react";
import DatePickerField from "../components/ui/DatePickerField";
import {
    Alert,
    Animated,
    FlatList,
    Modal,
    PanResponder,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import {
    addBehaviorGrade,
    addBehaviorPoints,
    addGrade,
    BehaviorEntry,
    deleteGrade,
    getBehaviorForStudent,
    getClasses,
    getGradesForStudentAndSubject,
    getStudents,
    getStudentsByClass,
    getSubjects,
    GradeEntry,
    SchoolClass,
    Student,
    Subject,
    updateGrade,
} from "../api/teacher";
import { SegmentedControl } from "../components/editorial/MobileBlocks";
import ErrorState from "../components/ErrorState";
import Header from "../components/Header";
import EmptyState from "../components/ui/EmptyState";
import { R, S, T, cardShadow, getEditorialPalette } from "../theme/editorial";
import { useTheme } from "../theme/ThemeContext";

const QUICK_POINTS = [-5, -3, -1, 1, 3, 5];
const BEHAVIOR_GRADES = [1, 2, 3, 4, 5, 6];

function gradeLabel(g: number): string {
    const frac = g % 1;
    if (frac === 0) return String(g);
    if (frac === 0.5) return `${Math.floor(g)}+`;
    if (frac === 0.75) return `${Math.ceil(g)}-`;
    return String(g);
}

function gradeChipColor(g: number): string {
    const v = Math.round(g);
    if (v <= 1) return "#EF4444";
    if (v === 2) return "#F97316";
    if (v === 3) return "#EAB308";
    if (v === 4) return "#84CC16";
    if (v === 5) return "#22C55E";
    return "#3B82F6";
}

function computeWeightedAverage(grades: GradeEntry[]): number | null {
    const valid = grades.filter((g) => g.czy_do_sredniej !== false);
    if (valid.length === 0) return null;
    const totalWeight = valid.reduce((sum, g) => sum + (g.waga ?? 1), 0);
    const totalValue = valid.reduce((sum, g) => sum + g.wartosc * (g.waga ?? 1), 0);
    return totalValue / totalWeight;
}

function computeGrade(base: number | null, modifier: "" | "+" | "-"): number | null {
    if (base === null) return null;
    if (modifier === "+") return base + 0.5;
    if (modifier === "-") return base - 0.25;
    return base;
}

function decomposeGrade(value: number): { base: number; modifier: "" | "+" | "-" } {
    const frac = value % 1;
    if (Math.abs(frac - 0.5) < 0.01) return { base: Math.floor(value), modifier: "+" };
    if (Math.abs(frac - 0.75) < 0.01) return { base: Math.ceil(value), modifier: "-" };
    return { base: Math.round(value), modifier: "" };
}

function sName(s: Student): string {
    return `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || s.username || `#${s.id}`;
}

export default function TeacherGrades() {
    const { theme } = useTheme();
    const palette = getEditorialPalette(theme);
    const shadow = cardShadow(theme);

    // ── shared ────────────────────────────────────────────────────────────────
    const [mode, setMode] = useState<"grades" | "zachowanie">("grades");
    const [classes, setClasses] = useState<SchoolClass[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [_loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    // ── grades filter ─────────────────────────────────────────────────────────
    const [selectedClass, setSelectedClass] = useState<SchoolClass | null>(null);
    const [showClassPicker, setShowClassPicker] = useState(false);
    const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
    const [showSubjectPicker, setShowSubjectPicker] = useState(false);
    const [weight, setWeight] = useState(1);
    const [description, setDescription] = useState("");
    const [czyDoSredniej, setCzyDoSredniej] = useState(true);
    const [czyPunktowa, setCzyPunktowa] = useState(false);
    const [czyOpisowa, setCzyOpisowa] = useState(false);

    // ── grades student table ──────────────────────────────────────────────────
    const [students, setStudents] = useState<Student[]>([]);
    const [studentGrades, setStudentGrades] = useState<Map<number, GradeEntry[]>>(new Map());
    const [gradesLoading, setGradesLoading] = useState(false);
    const [addingForStudent, setAddingForStudent] = useState<Student | null>(null);
    const [modalBase, setModalBase] = useState<number | null>(null);
    const [modalModifier, setModalModifier] = useState<"" | "+" | "-">("");
    const [gradeSubmitting, setGradeSubmitting] = useState(false);
    const [editingGrade, setEditingGrade] = useState<GradeEntry | null>(null);
    const [gradeDate, setGradeDate] = useState(() => new Date().toISOString().split('T')[0]);

    // ── grade detail sheet ────────────────────────────────────────────────────
    const [detailStudent, setDetailStudent] = useState<Student | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);
    const detailModalY = useRef(new Animated.Value(600)).current;
    const closeDetailRef = useRef<() => void>(() => {});
    closeDetailRef.current = () => {
        Animated.timing(detailModalY, { toValue: 600, duration: 250, useNativeDriver: true }).start(() => {
            setDetailOpen(false);
            setDetailStudent(null);
            detailModalY.setValue(600);
        });
    };
    const detailDragHandle = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 3,
            onPanResponderMove: (_, g) => { detailModalY.setValue(Math.max(0, g.dy)); },
            onPanResponderRelease: (_, g) => {
                if (g.dy > 100 || g.vy > 1.2) { closeDetailRef.current(); }
                else { Animated.spring(detailModalY, { toValue: 0, useNativeDriver: true }).start(); }
            },
            onPanResponderTerminate: () => {
                Animated.spring(detailModalY, { toValue: 0, useNativeDriver: true }).start();
            },
        })
    ).current;

    // ── zachowanie mode ───────────────────────────────────────────────────────
    const [zachMode, setZachMode] = useState<"wpisy" | "oceny_okresowe">("wpisy");
    const [zachClass, setZachClass] = useState<SchoolClass | null>(null);
    const [zachShowClassPicker, setZachShowClassPicker] = useState(false);
    const [zachStudentSearch, setZachStudentSearch] = useState("");
    const [zachStudents, setZachStudents] = useState<Student[]>([]);
    const [zachStudentsLoading, setZachStudentsLoading] = useState(false);

    // ── behavior points modal ─────────────────────────────────────────────────
    const [behaviorModalOpen, setBehaviorModalOpen] = useState(false);
    const [behaviorModalStudent, setBehaviorModalStudent] = useState<Student | null>(null);
    const [behaviorPoints, setBehaviorPoints] = useState("");
    const [behaviorDescription, setBehaviorDescription] = useState("");
    const [behaviorRecentEntries, setBehaviorRecentEntries] = useState<BehaviorEntry[]>([]);
    const [behaviorSubmitting, setBehaviorSubmitting] = useState(false);

    // swipe-to-dismiss animation
    const behaviorModalY = useRef(new Animated.Value(600)).current;

    // ref so PanResponder (created once) always calls current close fn
    const closeBehaviorRef = useRef<() => void>(() => {});
    closeBehaviorRef.current = () => {
        Animated.timing(behaviorModalY, { toValue: 600, duration: 250, useNativeDriver: true }).start(() => {
            setBehaviorModalOpen(false);
            setBehaviorModalStudent(null);
            behaviorModalY.setValue(600);
        });
    };

    const behaviorDragHandle = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 3,
            onPanResponderMove: (_, g) => {
                behaviorModalY.setValue(Math.max(0, g.dy));
            },
            onPanResponderRelease: (_, g) => {
                if (g.dy > 100 || g.vy > 1.2) {
                    closeBehaviorRef.current();
                } else {
                    Animated.spring(behaviorModalY, { toValue: 0, useNativeDriver: true }).start();
                }
            },
            onPanResponderTerminate: () => {
                Animated.spring(behaviorModalY, { toValue: 0, useNativeDriver: true }).start();
            },
        })
    ).current;

    // ── periodic behavior grade modal ─────────────────────────────────────────
    const [periodicModalOpen, setPeriodicModalOpen] = useState(false);
    const [periodicStudent, setPeriodicStudent] = useState<Student | null>(null);
    const [periodicPeriod, setPeriodicPeriod] = useState<1 | 2>(1);
    const [periodicGrade, setPeriodicGrade] = useState<number | null>(null);
    const [periodicProponowana, setPeriodicProponowana] = useState(false);
    const [periodicSubmitting, setPeriodicSubmitting] = useState(false);

    const periodicModalY = useRef(new Animated.Value(600)).current;

    const closePeriodicRef = useRef<() => void>(() => {});
    closePeriodicRef.current = () => {
        Animated.timing(periodicModalY, { toValue: 600, duration: 250, useNativeDriver: true }).start(() => {
            setPeriodicModalOpen(false);
            setPeriodicStudent(null);
            periodicModalY.setValue(600);
        });
    };

    const periodicDragHandle = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 3,
            onPanResponderMove: (_, g) => {
                periodicModalY.setValue(Math.max(0, g.dy));
            },
            onPanResponderRelease: (_, g) => {
                if (g.dy > 100 || g.vy > 1.2) {
                    closePeriodicRef.current();
                } else {
                    Animated.spring(periodicModalY, { toValue: 0, useNativeDriver: true }).start();
                }
            },
            onPanResponderTerminate: () => {
                Animated.spring(periodicModalY, { toValue: 0, useNativeDriver: true }).start();
            },
        })
    ).current;

    // ── data loading ──────────────────────────────────────────────────────────
    const load = async () => {
        setFetchError(null);
        try {
            const [cls, sub] = await Promise.all([getClasses(), getSubjects()]);
            setClasses(cls.sort((a, b) => (a.nazwa ?? "").localeCompare(b.nazwa ?? "")));
            setSubjects(sub);
        } catch (err) {
            setFetchError(err instanceof Error ? err.message : 'Nie udało się pobrać danych.');
        } finally {
            setLoading(false);
        }
    };

    const loadStudentGrades = async (classId: number, subjectId: number) => {
        setGradesLoading(true);
        try {
            const sorted = (await getStudentsByClass(classId)).sort((a, b) => sName(a).localeCompare(sName(b)));
            setStudents(sorted);
            const results = await Promise.all(
                sorted.map(async (s) => [s.id, await getGradesForStudentAndSubject(s.id, subjectId)] as [number, GradeEntry[]])
            );
            setStudentGrades(new Map(results));
        } catch {
            setStudentGrades(new Map());
        } finally {
            setGradesLoading(false);
        }
    };

    useEffect(() => { void load(); }, [reloadKey]);

    useEffect(() => {
        if (!selectedClass || !selectedSubject) { setStudentGrades(new Map()); setStudents([]); return; }
        void loadStudentGrades(selectedClass.id, selectedSubject.id);
    }, [selectedClass?.id, selectedSubject?.id]);

    useEffect(() => {
        if (mode !== "zachowanie") return;
        setZachStudentsLoading(true);
        const promise = zachClass ? getStudentsByClass(zachClass.id) : getStudents();
        promise
            .then((s) => setZachStudents(s.sort((a, b) => sName(a).localeCompare(sName(b)))))
            .catch(() => setZachStudents([]))
            .finally(() => setZachStudentsLoading(false));
    }, [mode, zachClass?.id]);

    useEffect(() => {
        if (!behaviorModalStudent) { setBehaviorRecentEntries([]); return; }
        getBehaviorForStudent(behaviorModalStudent.id)
            .then((e) => setBehaviorRecentEntries(e.slice(0, 5)))
            .catch(() => setBehaviorRecentEntries([]));
    }, [behaviorModalStudent?.id]);

    const onRefresh = async () => {
        setRefreshing(true);
        await load();
        if (selectedClass && selectedSubject) await loadStudentGrades(selectedClass.id, selectedSubject.id);
        setRefreshing(false);
    };

    // ── derived ───────────────────────────────────────────────────────────────
    const zachFilteredStudents = useMemo(() => {
        const search = zachStudentSearch.trim().toLowerCase();
        if (!zachClass && search.length < 2) return [];
        if (!search) return zachStudents;
        return zachStudents.filter((s) => sName(s).toLowerCase().includes(search));
    }, [zachStudents, zachStudentSearch, zachClass]);

    // ── handlers ──────────────────────────────────────────────────────────────
    const closeGradePickers = () => { setShowClassPicker(false); setShowSubjectPicker(false); };

    const openBehaviorModal = (s: Student) => {
        setBehaviorModalStudent(s);
        setBehaviorPoints("");
        setBehaviorDescription("");
        behaviorModalY.setValue(600);
        setBehaviorModalOpen(true);
        Animated.spring(behaviorModalY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 10 }).start();
    };

    const openPeriodicModal = (s: Student) => {
        setPeriodicStudent(s);
        setPeriodicGrade(null);
        setPeriodicPeriod(1);
        setPeriodicProponowana(false);
        periodicModalY.setValue(600);
        setPeriodicModalOpen(true);
        Animated.spring(periodicModalY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 10 }).start();
    };

    const openDetailSheet = (s: Student) => {
        setDetailStudent(s);
        detailModalY.setValue(600);
        setDetailOpen(true);
        Animated.spring(detailModalY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 10 }).start();
    };

    const openEditGrade = (grade: GradeEntry, s: Student) => {
        const { base, modifier } = decomposeGrade(grade.wartosc);
        setEditingGrade(grade);
        setModalBase(base);
        setModalModifier(modifier);
        Animated.timing(detailModalY, { toValue: 600, duration: 200, useNativeDriver: true }).start(() => {
            setDetailOpen(false);
            detailModalY.setValue(600);
            setAddingForStudent(s);
        });
    };

    const handleDeleteGrade = (grade: GradeEntry) => {
        const s = detailStudent;
        Alert.alert(
            "Usuń ocenę",
            `Czy na pewno chcesz usunąć ocenę ${gradeLabel(grade.wartosc)}?`,
            [
                { text: "Anuluj", style: "cancel" },
                {
                    text: "Usuń",
                    style: "destructive",
                    onPress: async () => {
                        if (!s || !selectedSubject || !grade.id) return;
                        const ok = await deleteGrade(grade.id);
                        if (ok) {
                            const updated = await getGradesForStudentAndSubject(s.id, selectedSubject.id);
                            setStudentGrades((prev) => { const next = new Map(prev); next.set(s.id, updated); return next; });
                        } else {
                            Alert.alert("Błąd", "Nie udało się usunąć oceny");
                        }
                    },
                },
            ]
        );
    };

    const handleGradeModalSubmit = async () => {
        const gradeValue = computeGrade(modalBase, modalModifier);
        if (!addingForStudent || !selectedSubject || gradeValue === null) return;
        setGradeSubmitting(true);
        const isEdit = editingGrade !== null;
        const ok = isEdit
            ? await updateGrade(editingGrade!.id!, { wartosc: gradeValue })
            : await addGrade({
                uczen: addingForStudent.id,
                przedmiot: selectedSubject.id,
                wartosc: gradeValue,
                waga: weight,
                opis: description || undefined,
                czy_do_sredniej: czyDoSredniej,
                data_wystawienia: gradeDate,
            });
        setGradeSubmitting(false);
        if (ok) {
            const updated = await getGradesForStudentAndSubject(addingForStudent.id, selectedSubject.id);
            const ref = addingForStudent;
            setStudentGrades((prev) => { const next = new Map(prev); next.set(ref.id, updated); return next; });
            setAddingForStudent(null);
            setEditingGrade(null);
            Alert.alert("Sukces", isEdit
                ? `Ocena zmieniona na ${gradeLabel(gradeValue)}`
                : `Ocena ${gradeLabel(gradeValue)} wystawiona dla ${sName(addingForStudent)}`);
        } else {
            Alert.alert("Błąd", isEdit ? "Nie udało się zaktualizować oceny" : "Nie udało się wystawić oceny");
        }
    };

    const handleBehaviorSubmit = async () => {
        const numPoints = parseInt(behaviorPoints);
        if (!behaviorModalStudent) return;
        if (!behaviorPoints || isNaN(numPoints)) { Alert.alert("Błąd", "Podaj liczbę punktów"); return; }
        if (!behaviorDescription.trim()) { Alert.alert("Błąd", "Podaj opis wpisu"); return; }
        setBehaviorSubmitting(true);
        const ok = await addBehaviorPoints({ uczen: behaviorModalStudent.id, punkty: numPoints, opis: behaviorDescription });
        setBehaviorSubmitting(false);
        if (ok) {
            const entries = await getBehaviorForStudent(behaviorModalStudent.id);
            setBehaviorRecentEntries(entries.slice(0, 5));
            setBehaviorPoints("");
            setBehaviorDescription("");
            Alert.alert("Sukces", `Zapisano ${numPoints > 0 ? "+" : ""}${numPoints} pkt dla ${sName(behaviorModalStudent)}`);
        } else {
            Alert.alert("Błąd", "Nie udało się zapisać punktów");
        }
    };

    const handlePeriodicSubmit = async () => {
        if (!periodicStudent || periodicGrade === null) return;
        setPeriodicSubmitting(true);
        const ok = await addBehaviorGrade({ uczen: periodicStudent.id, ocena: periodicGrade, okres: periodicPeriod, proponowana: periodicProponowana });
        setPeriodicSubmitting(false);
        if (ok) {
            closePeriodicRef.current();
            Alert.alert("Sukces", `Ocena ${periodicGrade} za ${periodicPeriod}. okres wystawiona dla ${sName(periodicStudent)}`);
        } else {
            Alert.alert("Błąd", "Nie udało się wystawić oceny okresowej");
        }
    };

    // ── picker renderer ───────────────────────────────────────────────────────
    const renderPicker = (
        label: string,
        value: string | null,
        placeholder: string,
        isOpen: boolean,
        onToggle: () => void,
        children: React.ReactNode,
        disabled?: boolean,
    ) => (
        <>
            <Text style={[T.labelBold, styles.fieldLabel, { color: palette.textSoft }]}>{label}</Text>
            <TouchableOpacity
                style={[styles.selector, { backgroundColor: palette.inputSurface, opacity: disabled ? 0.45 : 1 }]}
                onPress={disabled ? undefined : onToggle}
                activeOpacity={disabled ? 1 : 0.7}
            >
                <Text style={[T.body, { color: value ? palette.text : palette.textSoft, flex: 1 }]}>
                    {value ?? placeholder}
                </Text>
                <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={palette.textSoft} />
            </TouchableOpacity>
            {isOpen && (
                <View style={[styles.dropdown, styles.dropdownList]}>
                    <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                        {children}
                    </ScrollView>
                </View>
            )}
        </>
    );

    // ── flat list config ──────────────────────────────────────────────────────
    // Determines which list + callbacks the FlatList uses based on current mode.
    const flatListData: Student[] = mode === "grades" ? students : zachFilteredStudents;

    const flatListOnAdd = (s: Student) => {
        if (mode === "grades") {
            setAddingForStudent(s);
            setModalBase(null);
            setModalModifier("");
            setEditingGrade(null);
        } else if (zachMode === "wpisy") {
            openBehaviorModal(s);
        } else {
            openPeriodicModal(s);
        }
    };

    const flatListRightLabel = mode === "grades"
        ? "OCENY"
        : zachMode === "wpisy" ? "ZACHOWANIE" : "OCENA OKRS.";

    const renderFlatListRight = (s: Student): React.ReactNode => {
        if (mode === "grades") {
            const avg = computeWeightedAverage(studentGrades.get(s.id) ?? []);
            return avg !== null
                ? <View style={[styles.gradeChip, { backgroundColor: gradeChipColor(avg) }]}><Text style={styles.gradeChipText}>{avg.toFixed(1)}</Text></View>
                : <Text style={[T.label, { color: palette.textMuted }]}>—</Text>;
        }
        return s.klasa_nazwa ? <Text style={[T.label, { color: palette.textMuted }]}>{s.klasa_nazwa}</Text> : null;
    };

    const flatListOnRowPress = mode === "grades" ? openDetailSheet : undefined;

    const renderStudentItem = ({ item, index }: { item: Student; index: number }) => (
        <View style={[styles.studentRowOuter, { backgroundColor: palette.surface }]}>
            <TouchableOpacity
                activeOpacity={flatListOnRowPress ? 0.6 : 1}
                onPress={flatListOnRowPress ? () => flatListOnRowPress(item) : undefined}
                style={[styles.studentRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.inputSurface }]}
            >
                <Text style={[T.label, styles.colNr, { color: palette.textMuted }]}>{index + 1}</Text>
                <Text style={[T.bodyMedium, styles.colName, { color: palette.text }]} numberOfLines={1}>{sName(item)}</Text>
                <View style={styles.gradeChips}>
                    {renderFlatListRight(item)}
                </View>
                <TouchableOpacity style={[styles.addBtn, { backgroundColor: palette.primary }]} onPress={() => flatListOnAdd(item)}>
                    <Ionicons name="add" size={20} color={palette.onPrimary} />
                </TouchableOpacity>
            </TouchableOpacity>
        </View>
    );

    // ── FlatList header (everything above the student rows) ───────────────────
    const listHeader = (
        <>
            <View style={styles.modeSwitcher}>
                <SegmentedControl
                    value={mode}
                    onChange={setMode}
                    options={[
                        { key: "grades", label: "Oceny" },
                        { key: "zachowanie", label: "Zachowanie" },
                    ]}
                />
            </View>

            <View style={styles.bodyPad}>
                {mode === "grades" ? (
                    /* ── GRADES MODE filter card ──────────────────────────── */
                    <>
                        <View style={[styles.card, { backgroundColor: palette.surface }, shadow]}>
                            <Text style={[T.eyebrow, { color: palette.textSoft, marginBottom: S[3] }]}>FILTROWANIE</Text>
                            {renderPicker(
                                "Przedmiot", selectedSubject?.nazwa ?? null, "Wybierz przedmiot...",
                                showSubjectPicker, () => { closeGradePickers(); setShowSubjectPicker((v) => !v); },
                                <>
                                    {subjects.map((sub) => (
                                        <TouchableOpacity key={sub.id} style={[styles.dropdownItem, selectedSubject?.id === sub.id && { backgroundColor: palette.primaryFixed }]} onPress={() => { setSelectedSubject(sub); setShowSubjectPicker(false); }}>
                                            <Text style={[T.body, { color: palette.text }]}>{sub.nazwa}</Text>
                                        </TouchableOpacity>
                                    ))}
                                    {subjects.length === 0 && <Text style={[T.label, styles.emptyMsg, { color: palette.textMuted }]}>Brak przedmiotów</Text>}
                                </>
                            )}
                            <View style={styles.gap} />
                            {renderPicker(
                                "Klasa", selectedClass?.nazwa ?? null, "Wybierz klasę...",
                                showClassPicker, () => { closeGradePickers(); setShowClassPicker((v) => !v); },
                                <>
                                    {classes.map((c) => (
                                        <TouchableOpacity key={c.id} style={[styles.dropdownItem, selectedClass?.id === c.id && { backgroundColor: palette.primaryFixed }]} onPress={() => { setSelectedClass(c); setShowClassPicker(false); }}>
                                            <Text style={[T.body, { color: palette.text }]}>{c.nazwa}</Text>
                                        </TouchableOpacity>
                                    ))}
                                    {classes.length === 0 && <Text style={[T.label, styles.emptyMsg, { color: palette.textMuted }]}>Brak klas</Text>}
                                </>
                            )}
                            <View style={styles.gap} />
                            <Text style={[T.labelBold, styles.fieldLabel, { color: palette.textSoft }]}>Waga</Text>
                            <View style={styles.weightRow}>
                                {[1, 2, 3, 4, 5].map((w) => (
                                    <TouchableOpacity key={w} style={[styles.weightChip, { backgroundColor: weight === w ? palette.primary : palette.inputSurface }]} onPress={() => setWeight(w)}>
                                        <Text style={[T.labelBold, { fontSize: 17, color: weight === w ? palette.onPrimary : palette.text }]}>{w}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <View style={styles.gap} />
                            <Text style={[T.labelBold, styles.fieldLabel, { color: palette.textSoft }]}>Opis (opcjonalnie)</Text>
                            <TextInput value={description} onChangeText={setDescription} placeholder="Np. sprawdzian z rozdziału 3..." placeholderTextColor={palette.textSoft} multiline numberOfLines={2} style={[styles.textInput, styles.textArea, { backgroundColor: palette.inputSurface, color: palette.text }]} />
                            <View style={styles.gap} />
                            <View style={styles.toggleRow}>
                                {([
                                    { label: "Do śr.", val: czyDoSredniej, set: setCzyDoSredniej },
                                    { label: "Punktowa", val: czyPunktowa, set: setCzyPunktowa },
                                    { label: "Opisowa", val: czyOpisowa, set: setCzyOpisowa },
                                ] as const).map(({ label, val, set }) => (
                                    <TouchableOpacity key={label} style={[styles.toggleChip, { backgroundColor: val ? palette.primary : palette.inputSurface }]} onPress={() => set((v) => !v)}>
                                        <Text style={[T.labelBold, { fontSize: 13, color: val ? palette.onPrimary : palette.text }]}>{label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {selectedClass && selectedSubject && (
                            <View style={styles.sectionHeader}>
                                <Text style={[T.eyebrow, { color: palette.textSoft }]}>{selectedClass.nazwa} — {selectedSubject.nazwa.toUpperCase()}</Text>
                            </View>
                        )}
                    </>
                ) : (
                    /* ── ZACHOWANIE MODE filter card ──────────────────────── */
                    <>
                        <View style={[styles.card, { backgroundColor: palette.surface }, shadow]}>
                            <Text style={[T.eyebrow, { color: palette.textSoft, marginBottom: S[3] }]}>FILTROWANIE</Text>
                            {renderPicker(
                                "Klasa (opcjonalnie)", zachClass?.nazwa ?? null, "Wszyscy uczniowie",
                                zachShowClassPicker, () => setZachShowClassPicker((v) => !v),
                                <>
                                    <TouchableOpacity style={[styles.dropdownItem, zachClass === null && { backgroundColor: palette.primaryFixed }]} onPress={() => { setZachClass(null); setZachShowClassPicker(false); }}>
                                        <Text style={[T.body, { color: palette.text }]}>Wszyscy uczniowie</Text>
                                    </TouchableOpacity>
                                    {classes.map((c) => (
                                        <TouchableOpacity key={c.id} style={[styles.dropdownItem, zachClass?.id === c.id && { backgroundColor: palette.primaryFixed }]} onPress={() => { setZachClass(c); setZachShowClassPicker(false); }}>
                                            <Text style={[T.body, { color: palette.text }]}>{c.nazwa}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </>
                            )}
                            <View style={styles.gap} />
                            <Text style={[T.labelBold, styles.fieldLabel, { color: palette.textSoft }]}>Szukaj ucznia</Text>
                            <TextInput value={zachStudentSearch} onChangeText={setZachStudentSearch} placeholder="Wpisz imię lub nazwisko..." placeholderTextColor={palette.textSoft} style={[styles.textInput, { backgroundColor: palette.inputSurface, color: palette.text }]} />
                        </View>

                        <View style={{ marginBottom: S[3] }}>
                            <SegmentedControl
                                value={zachMode}
                                onChange={setZachMode}
                                options={[
                                    { key: "wpisy", label: "Punkty" },
                                    { key: "oceny_okresowe", label: "Oceny okresowe" },
                                ]}
                            />
                        </View>

                        {zachClass && zachFilteredStudents.length > 0 && (
                            <View style={styles.sectionHeader}>
                                <Text style={[T.eyebrow, { color: palette.textSoft }]}>{zachClass.nazwa}</Text>
                            </View>
                        )}
                    </>
                )}

                {/* Table card top (header row) — only shown when there will be rows */}
                {flatListData.length > 0 && (
                    <View style={[styles.card, styles.tableCard, { backgroundColor: palette.surface }, shadow, { marginBottom: 0 }]}>
                        <View style={[styles.tableHeader, { borderBottomColor: palette.inputSurface }]}>
                            <Text style={[T.label, styles.colNr, { color: palette.textMuted }]}>NR</Text>
                            <Text style={[T.label, styles.colName, { color: palette.textMuted }]}>UCZEŃ</Text>
                            <Text style={[T.label, { color: palette.textMuted, marginRight: 36 + S[2] }]}>{flatListRightLabel}</Text>
                        </View>
                    </View>
                )}
            </View>
        </>
    );

    // ── FlatList empty/loading state ──────────────────────────────────────────
    const listEmpty = (
        <View style={styles.bodyPad}>
            {mode === "grades" ? (
                gradesLoading ? (
                    <View style={[styles.card, styles.centeredCard, { backgroundColor: palette.surface }, shadow]}>
                        <Text style={[T.body, { color: palette.textSoft }]}>Ładowanie uczniów i ocen...</Text>
                    </View>
                ) : (
                    <EmptyState title="Wybierz klasę i przedmiot" subtitle="Lista uczniów pojawi się po wybraniu klasy i przedmiotu." icon="people-outline" />
                )
            ) : (
                zachStudentsLoading ? (
                    <View style={[styles.card, styles.centeredCard, { backgroundColor: palette.surface }, shadow]}>
                        <Text style={[T.body, { color: palette.textSoft }]}>Ładowanie uczniów...</Text>
                    </View>
                ) : (
                    <EmptyState
                        title={zachClass ? "Brak uczniów w klasie" : "Wybierz klasę lub wyszukaj ucznia"}
                        subtitle={zachClass ? "" : "Wpisz minimum 2 znaki aby wyszukać ucznia."}
                        icon="people-outline"
                    />
                )
            )}
        </View>
    );

    // ── render ────────────────────────────────────────────────────────────────
    if (fetchError !== null) {
        return (
            <View style={[styles.root, { backgroundColor: palette.background }]}>
                <Header title="Oceny" subtitle="Wystaw ocenę lub dodaj wpis zachowania" />
                <ErrorState message={fetchError} onRetry={() => setReloadKey(k => k + 1)} />
            </View>
        );
    }

    return (
        <>
            <View style={[styles.root, { backgroundColor: palette.background }]}>
            <Header title="Oceny" subtitle="Wystaw ocenę lub dodaj wpis zachowania" />
            <FlatList
                data={flatListData}
                keyExtractor={(item) => String(item.id)}
                renderItem={renderStudentItem}
                ListHeaderComponent={listHeader}
                ListEmptyComponent={listEmpty}
                ListFooterComponent={
                    flatListData.length > 0
                        ? <View style={[styles.tableCardBottom, { backgroundColor: palette.surface }, shadow]} />
                        : <View style={{ height: S[8] }} />
                }
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                initialNumToRender={10}
                maxToRenderPerBatch={5}
                style={{ flex: 1 }}
                contentContainerStyle={flatListData.length === 0 ? undefined : { paddingBottom: S[8] }}
            />
            </View>

            {/* ── Grade entry modal ──────────────────────────────────────────── */}
            <Modal visible={addingForStudent !== null} transparent animationType="slide"
                onRequestClose={() => { setAddingForStudent(null); setEditingGrade(null); }}>
                <Pressable style={styles.modalOverlay} onPress={() => { setAddingForStudent(null); setEditingGrade(null); }}>
                    <View style={[styles.modalCard, { backgroundColor: palette.surface }]} onStartShouldSetResponder={() => true}>
                        <Text style={[T.bodyMedium, { color: palette.text, fontSize: 18, marginBottom: S[1] }]}>
                            {editingGrade ? "Edytuj ocenę" : (addingForStudent ? sName(addingForStudent) : "")}
                        </Text>
                        <Text style={[T.label, { color: palette.textSoft, marginBottom: S[4] }]}>
                            {editingGrade
                                ? `${addingForStudent ? sName(addingForStudent) : ""} · ${selectedSubject?.nazwa} · Waga ${editingGrade.waga ?? weight}`
                                : `${selectedSubject?.nazwa} · Waga ${weight}`}
                        </Text>
                        <Text style={[T.labelBold, { color: palette.textSoft, marginBottom: S[2] }]}>Ocena</Text>
                        <View style={styles.baseGradeRow}>
                            {[1, 2, 3, 4, 5, 6].map((b) => (
                                <TouchableOpacity key={b} style={[styles.baseGradeChip, { backgroundColor: modalBase === b ? gradeChipColor(b) : palette.inputSurface }]}
                                    onPress={() => { setModalBase(b); setModalModifier((prev) => (prev === "-" && b === 1) ? "" : (prev === "+" && b === 6) ? "" : prev); }}>
                                    <Text style={[T.labelBold, { fontSize: 22, lineHeight: 28, color: modalBase === b ? "#fff" : palette.text }]}>{b}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <Text style={[T.labelBold, { color: palette.textSoft, marginTop: S[4], marginBottom: S[2] }]}>Modyfikator</Text>
                        <View style={styles.modifierRow}>
                            {(["-", "", "+"] as const).map((mod) => {
                                const disabled = (mod === "-" && modalBase === 1) || (mod === "+" && modalBase === 6);
                                const active = modalModifier === mod;
                                const gradeVal = computeGrade(modalBase, mod);
                                return (
                                    <TouchableOpacity key={mod === "" ? "none" : mod} style={[styles.modifierChip, { backgroundColor: active ? palette.primary : palette.inputSurface, opacity: disabled ? 0.3 : 1 }]} disabled={disabled} onPress={() => setModalModifier(mod)}>
                                        <Text style={[T.labelBold, { fontSize: 18, lineHeight: 24, color: active ? palette.onPrimary : palette.text }]}>{mod === "" ? "bez" : mod}</Text>
                                        {gradeVal !== null && <Text style={[T.label, { fontSize: 11, color: active ? palette.onPrimary : palette.textMuted }]}>{gradeLabel(gradeVal)}</Text>}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        <View style={styles.gap} />
                        <DatePickerField
                            value={gradeDate}
                            onChange={setGradeDate}
                            label="Data wystawienia"
                        />
                        <View style={styles.gap} />
                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: palette.inputSurface }]} onPress={() => { setAddingForStudent(null); setEditingGrade(null); }}>
                                <Text style={[T.labelBold, { color: palette.text }]}>Anuluj</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: palette.primary, opacity: modalBase === null || gradeSubmitting ? 0.5 : 1 }]} disabled={modalBase === null || gradeSubmitting} onPress={handleGradeModalSubmit}>
                                <Text style={[T.labelBold, { color: palette.onPrimary }]}>
                                    {gradeSubmitting
                                        ? (editingGrade ? "Zapisywanie..." : "Wystawianie...")
                                        : (editingGrade ? `Zapisz ${modalBase !== null ? gradeLabel(computeGrade(modalBase, modalModifier)!) : ""}` : `Wystaw ${modalBase !== null ? gradeLabel(computeGrade(modalBase, modalModifier)!) : ""}`)}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Pressable>
            </Modal>

            {/* ── Behavior points modal (swipe-to-dismiss) ──────────────────── */}
            <Modal visible={behaviorModalOpen} transparent animationType="none" onRequestClose={() => closeBehaviorRef.current()}>
                <Pressable style={styles.modalOverlay} onPress={() => closeBehaviorRef.current()}>
                    <Animated.View
                        style={[styles.modalCard, { backgroundColor: palette.surface, transform: [{ translateY: behaviorModalY }] }]}
                        onStartShouldSetResponder={() => true}
                    >
                        {/* Drag handle */}
                        <View {...behaviorDragHandle.panHandlers} style={styles.dragHandleArea}>
                            <View style={[styles.dragHandle, { backgroundColor: palette.inputSurface }]} />
                        </View>

                        <Text style={[T.bodyMedium, { color: palette.text, fontSize: 18, marginBottom: S[1] }]}>
                            {behaviorModalStudent ? sName(behaviorModalStudent) : ""}
                        </Text>
                        {behaviorModalStudent?.klasa_nazwa
                            ? <Text style={[T.label, { color: palette.textSoft, marginBottom: S[4] }]}>{behaviorModalStudent.klasa_nazwa}</Text>
                            : <View style={{ height: S[4] }} />}

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: "80%" }}>
                            <Text style={[T.labelBold, { color: palette.textSoft, marginBottom: S[2] }]}>Szybki wybór punktów</Text>
                            <View style={styles.quickRow}>
                                {QUICK_POINTS.map((p) => {
                                    const active = String(p) === behaviorPoints;
                                    const isPos = p > 0;
                                    return (
                                        <TouchableOpacity key={p} onPress={() => setBehaviorPoints(String(p))} style={[styles.quickChip, { backgroundColor: active ? (isPos ? palette.success : palette.danger) : palette.inputSurface }]}>
                                            <Text style={[T.labelBold, { fontSize: 15, color: active ? "#fff" : (isPos ? palette.success : palette.danger) }]}>{p > 0 ? `+${p}` : String(p)}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                            <View style={styles.gap} />
                            <Text style={[T.labelBold, { color: palette.textSoft, marginBottom: S[1] }]}>Punkty (ręcznie)</Text>
                            <TextInput value={behaviorPoints} onChangeText={setBehaviorPoints} keyboardType="numbers-and-punctuation" placeholder="np. -3 lub 5" placeholderTextColor={palette.textSoft}
                                style={[styles.textInput, { backgroundColor: palette.inputSurface, color: (() => { const n = parseInt(behaviorPoints) || 0; return n > 0 ? palette.success : n < 0 ? palette.danger : palette.textSoft; })() }]} />
                            <View style={styles.gap} />
                            <Text style={[T.labelBold, { color: palette.textSoft, marginBottom: S[1] }]}>Opis wpisu</Text>
                            <TextInput value={behaviorDescription} onChangeText={setBehaviorDescription} placeholder="Np. bójka na przerwie, pomoc kolegom..." placeholderTextColor={palette.textSoft} multiline numberOfLines={3} style={[styles.textInput, styles.textArea, { backgroundColor: palette.inputSurface, color: palette.text }]} />

                            {behaviorRecentEntries.length > 0 && (
                                <>
                                    <Text style={[T.eyebrow, { color: palette.textSoft, marginTop: S[5], marginBottom: S[2] }]}>OSTATNIE WPISY</Text>
                                    {behaviorRecentEntries.map((e, i) => {
                                        const pts = e.punkty ?? 0;
                                        const isPos = pts >= 0;
                                        return (
                                            <View key={e.id ?? i} style={[styles.behaviorEntryRow, { backgroundColor: palette.inputSurface }]}>
                                                <View style={[styles.behaviorEntryBadge, { backgroundColor: isPos ? palette.successBg : palette.dangerBg }]}>
                                                    <Text style={[T.labelBold, { color: isPos ? palette.success : palette.danger, fontSize: 14 }]}>{pts > 0 ? `+${pts}` : String(pts)}</Text>
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[T.body, { color: palette.text }]} numberOfLines={2}>{e.opis ?? "—"}</Text>
                                                    {e.data ? <Text style={[T.label, { color: palette.textMuted, marginTop: 2 }]}>{e.data}</Text> : null}
                                                </View>
                                            </View>
                                        );
                                    })}
                                </>
                            )}

                            <View style={styles.gapLg} />
                            <View style={styles.modalButtons}>
                                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: palette.inputSurface }]} onPress={() => closeBehaviorRef.current()}>
                                    <Text style={[T.labelBold, { color: palette.text }]}>Zamknij</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: palette.primary, opacity: behaviorSubmitting ? 0.6 : 1 }]} disabled={behaviorSubmitting} onPress={handleBehaviorSubmit}>
                                    <Text style={[T.labelBold, { color: palette.onPrimary }]}>{behaviorSubmitting ? "Zapisywanie..." : "Dodaj wpis"}</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={{ height: S[5] }} />
                        </ScrollView>
                    </Animated.View>
                </Pressable>
            </Modal>

            {/* ── Grade detail sheet (swipe-to-dismiss) ─────────────────────── */}
            <Modal visible={detailOpen} transparent animationType="none" onRequestClose={() => closeDetailRef.current()}>
                <Pressable style={styles.modalOverlay} onPress={() => closeDetailRef.current()}>
                    <Animated.View style={[styles.modalCard, { backgroundColor: palette.surface, transform: [{ translateY: detailModalY }] }]} onStartShouldSetResponder={() => true}>
                        <View {...detailDragHandle.panHandlers} style={styles.dragHandleArea}>
                            <View style={[styles.dragHandle, { backgroundColor: palette.inputSurface }]} />
                        </View>

                        <Text style={[T.bodyMedium, { color: palette.text, fontSize: 18, marginBottom: S[1] }]}>
                            {detailStudent ? sName(detailStudent) : ""}
                        </Text>
                        <Text style={[T.label, { color: palette.textSoft, marginBottom: S[3] }]}>
                            {selectedSubject?.nazwa}
                        </Text>

                        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: "75%" }}>
                            {(() => {
                                const grades = detailStudent ? (studentGrades.get(detailStudent.id) ?? []) : [];
                                const avg = computeWeightedAverage(grades);
                                if (grades.length === 0) {
                                    return <Text style={[T.label, { color: palette.textMuted, textAlign: "center", paddingVertical: S[4] }]}>Brak ocen</Text>;
                                }
                                return (
                                    <>
                                        {grades.map((g, i) => (
                                            <View key={g.id ?? i} style={[styles.gradeDetailRow, { borderBottomColor: palette.inputSurface, borderBottomWidth: i < grades.length - 1 ? StyleSheet.hairlineWidth : 0 }]}>
                                                <View style={[styles.gradeDetailChip, { backgroundColor: gradeChipColor(g.wartosc) }]}>
                                                    <Text style={[T.labelBold, { color: "#fff", fontSize: 16, lineHeight: 20 }]}>{gradeLabel(g.wartosc)}</Text>
                                                </View>
                                                <View style={{ flex: 1, marginHorizontal: S[3] }}>
                                                    <View style={{ flexDirection: "row", alignItems: "center", gap: S[2] }}>
                                                        <View style={[styles.weightBadge, { backgroundColor: palette.primaryFixed }]}>
                                                            <Text style={[T.label, { fontSize: 10, color: palette.primary }]}>W{g.waga ?? 1}</Text>
                                                        </View>
                                                        {g.data_wystawienia ? (
                                                            <Text style={[T.label, { fontSize: 11, color: palette.textMuted }]}>{g.data_wystawienia.slice(0, 10)}</Text>
                                                        ) : null}
                                                        {g.czy_do_sredniej === false && (
                                                            <Text style={[T.label, { fontSize: 10, color: palette.textMuted }]}>nie do śr.</Text>
                                                        )}
                                                    </View>
                                                    {g.opis ? <Text style={[T.label, { color: palette.textSoft, marginTop: 2 }]} numberOfLines={2}>{g.opis}</Text> : null}
                                                </View>
                                                <View style={styles.gradeDetailActions}>
                                                    <TouchableOpacity style={[styles.gradeActionBtn, { backgroundColor: palette.inputSurface }]} onPress={() => openEditGrade(g, detailStudent!)}>
                                                        <Ionicons name="pencil-outline" size={15} color={palette.text} />
                                                    </TouchableOpacity>
                                                    <TouchableOpacity style={[styles.gradeActionBtn, { backgroundColor: palette.dangerBg ?? "#FEE2E2" }]} onPress={() => handleDeleteGrade(g)}>
                                                        <Ionicons name="trash-outline" size={15} color={palette.danger ?? "#EF4444"} />
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        ))}
                                        {avg !== null && (
                                            <View style={[styles.avgRow, { borderTopColor: palette.inputSurface }]}>
                                                <Text style={[T.labelBold, { color: palette.textSoft }]}>Średnia ważona</Text>
                                                <View style={[styles.gradeDetailChip, { backgroundColor: gradeChipColor(avg) }]}>
                                                    <Text style={[T.labelBold, { color: "#fff", fontSize: 16, lineHeight: 20 }]}>{avg.toFixed(2)}</Text>
                                                </View>
                                            </View>
                                        )}
                                    </>
                                );
                            })()}
                            <View style={{ height: S[4] }} />
                        </ScrollView>

                        <View style={[styles.modalButtons, { marginTop: S[3] }]}>
                            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: palette.inputSurface }]} onPress={() => closeDetailRef.current()}>
                                <Text style={[T.labelBold, { color: palette.text }]}>Zamknij</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: palette.primary }]}
                                onPress={() => {
                                    Animated.timing(detailModalY, { toValue: 600, duration: 200, useNativeDriver: true }).start(() => {
                                        setDetailOpen(false);
                                        detailModalY.setValue(600);
                                        setAddingForStudent(detailStudent);
                                        setEditingGrade(null);
                                        setModalBase(null);
                                        setModalModifier("");
                                    });
                                }}>
                                <Ionicons name="add" size={18} color={palette.onPrimary} />
                                <Text style={[T.labelBold, { color: palette.onPrimary }]}>Dodaj ocenę</Text>
                            </TouchableOpacity>
                        </View>
                    </Animated.View>
                </Pressable>
            </Modal>

            {/* ── Periodic behavior grade modal (swipe-to-dismiss) ──────────── */}
            <Modal visible={periodicModalOpen} transparent animationType="none" onRequestClose={() => closePeriodicRef.current()}>
                <Pressable style={styles.modalOverlay} onPress={() => closePeriodicRef.current()}>
                    <Animated.View style={[styles.modalCard, { backgroundColor: palette.surface, transform: [{ translateY: periodicModalY }] }]} onStartShouldSetResponder={() => true}>
                        {/* Drag handle */}
                        <View {...periodicDragHandle.panHandlers} style={styles.dragHandleArea}>
                            <View style={[styles.dragHandle, { backgroundColor: palette.inputSurface }]} />
                        </View>

                        <Text style={[T.bodyMedium, { color: palette.text, fontSize: 18, marginBottom: S[1] }]}>
                            {periodicStudent ? sName(periodicStudent) : ""}
                        </Text>
                        <Text style={[T.label, { color: palette.textSoft, marginBottom: S[4] }]}>
                            Ocena z zachowania — okres
                        </Text>

                        {/* Period selector */}
                        <Text style={[T.labelBold, { color: palette.textSoft, marginBottom: S[2] }]}>Okres</Text>
                        <View style={styles.periodRow}>
                            {([1, 2] as const).map((p) => (
                                <TouchableOpacity key={p} style={[styles.periodChip, { backgroundColor: periodicPeriod === p ? palette.primary : palette.inputSurface }]} onPress={() => setPeriodicPeriod(p)}>
                                    <Text style={[T.labelBold, { fontSize: 16, lineHeight: 22, color: periodicPeriod === p ? palette.onPrimary : palette.text }]}>{p}. okres</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <View style={styles.gap} />
                        <TouchableOpacity
                            style={[styles.proponowanaChip, { backgroundColor: periodicProponowana ? palette.primary : palette.inputSurface }]}
                            onPress={() => setPeriodicProponowana((v) => !v)}
                        >
                            <Ionicons name={periodicProponowana ? "checkmark-circle" : "ellipse-outline"} size={18} color={periodicProponowana ? palette.onPrimary : palette.textSoft} />
                            <Text style={[T.labelBold, { fontSize: 14, color: periodicProponowana ? palette.onPrimary : palette.text }]}>Ocena proponowana</Text>
                        </TouchableOpacity>

                        {/* Grade 1-6 */}
                        <Text style={[T.labelBold, { color: palette.textSoft, marginTop: S[4], marginBottom: S[2] }]}>Ocena z zachowania</Text>
                        <View style={styles.baseGradeRow}>
                            {BEHAVIOR_GRADES.map((g) => (
                                <TouchableOpacity key={g} style={[styles.baseGradeChip, { backgroundColor: periodicGrade === g ? gradeChipColor(g) : palette.inputSurface }]} onPress={() => setPeriodicGrade(g)}>
                                    <Text style={[T.labelBold, { fontSize: 22, lineHeight: 28, color: periodicGrade === g ? "#fff" : palette.text }]}>{g}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <View style={styles.gapLg} />
                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: palette.inputSurface }]} onPress={() => closePeriodicRef.current()}>
                                <Text style={[T.labelBold, { color: palette.text }]}>Anuluj</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: palette.primary, opacity: periodicGrade === null || periodicSubmitting ? 0.5 : 1 }]} disabled={periodicGrade === null || periodicSubmitting} onPress={handlePeriodicSubmit}>
                                <Text style={[T.labelBold, { color: palette.onPrimary }]}>
                                    {periodicSubmitting ? "Wystawianie..." : `Wystaw ${periodicGrade ?? ""}`}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </Animated.View>
                </Pressable>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    modeSwitcher: { paddingHorizontal: S[4], paddingBottom: S[2] },
    body: { paddingHorizontal: S[4], paddingBottom: S[8] },
    bodyPad: { paddingHorizontal: S[4] },
    sectionHeader: { paddingVertical: S[3] },
    card: { borderRadius: R.lg, padding: S[4], marginBottom: S[4] },
    tableCard: { padding: 0, overflow: "hidden" },
    tableCardBottom: { marginHorizontal: S[4], marginBottom: S[4], height: S[2], borderBottomLeftRadius: R.lg, borderBottomRightRadius: R.lg },
    studentRowOuter: { marginHorizontal: S[4] },
    centeredCard: { alignItems: "center", justifyContent: "center", paddingVertical: S[6] },
    fieldLabel: { marginBottom: S[1] },
    selector: { borderRadius: R.md, paddingHorizontal: S[3], paddingVertical: S[3], flexDirection: "row", alignItems: "center" },
    dropdown: { marginTop: S[2], borderRadius: R.md, overflow: "hidden" },
    dropdownList: { maxHeight: 200 },
    dropdownItem: { paddingHorizontal: S[3], paddingVertical: S[2] + 2, borderRadius: R.sm },
    emptyMsg: { textAlign: "center", padding: S[3] },
    textInput: { borderRadius: R.md, paddingHorizontal: S[3], paddingVertical: S[3], fontSize: 15 },
    textArea: { minHeight: 64, textAlignVertical: "top" },
    gap: { height: S[4] },
    gapLg: { height: S[5] },
    weightRow: { flexDirection: "row", gap: S[2] },
    weightChip: { flex: 1, paddingVertical: S[3], borderRadius: R.md, alignItems: "center", justifyContent: "center" },
    toggleRow: { flexDirection: "row", gap: S[2], flexWrap: "wrap" },
    toggleChip: { paddingHorizontal: S[3], paddingVertical: S[2], borderRadius: R.full },
    tableHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: S[4], paddingVertical: S[2] + 2, borderBottomWidth: StyleSheet.hairlineWidth },
    colNr: { width: 32 },
    colName: { flex: 1, marginRight: S[2] },
    studentRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: S[4], paddingVertical: S[3], minHeight: 52 },
    gradeChips: { flexDirection: "row", gap: 4, alignItems: "center", flexShrink: 0, marginRight: S[2] },
    gradeChip: { minWidth: 30, height: 24, borderRadius: R.sm, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
    gradeChipText: { color: "#fff", fontSize: 12, fontWeight: "700" },
    addBtn: { width: 36, height: 36, borderRadius: R.full, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    quickRow: { flexDirection: "row", flexWrap: "wrap", gap: S[2] },
    quickChip: { paddingHorizontal: S[4], paddingVertical: S[2] + 2, borderRadius: R.md },
    behaviorEntryRow: { flexDirection: "row", alignItems: "center", borderRadius: R.md, padding: S[2] + 2, marginBottom: S[2], gap: S[2] },
    behaviorEntryBadge: { width: 44, height: 44, borderRadius: R.sm, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    modalCard: { borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, padding: S[5], paddingTop: S[2], paddingBottom: S[8] },
    dragHandleArea: { alignItems: "center", paddingVertical: S[3], marginBottom: S[2] },
    dragHandle: { width: 40, height: 4, borderRadius: 2 },
    baseGradeRow: { flexDirection: "row", gap: S[2] },
    baseGradeChip: { flex: 1, paddingVertical: S[4], borderRadius: R.md, alignItems: "center", justifyContent: "center" },
    modifierRow: { flexDirection: "row", gap: S[2] },
    modifierChip: { flex: 1, paddingVertical: S[3], borderRadius: R.md, alignItems: "center", justifyContent: "center", gap: 2 },
    periodRow: { flexDirection: "row", gap: S[3] },
    periodChip: { flex: 1, paddingVertical: S[3] + 2, borderRadius: R.md, alignItems: "center", justifyContent: "center" },
    proponowanaChip: { flexDirection: "row", alignItems: "center", gap: S[2], paddingHorizontal: S[3], paddingVertical: S[3], borderRadius: R.md },
    gradeDetailRow: { flexDirection: "row", alignItems: "center", paddingVertical: S[3] },
    gradeDetailChip: { width: 42, height: 42, borderRadius: R.md, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    weightBadge: { paddingHorizontal: S[1] + 2, paddingVertical: 2, borderRadius: R.sm },
    gradeDetailActions: { flexDirection: "row", gap: S[1], flexShrink: 0 },
    gradeActionBtn: { width: 34, height: 34, borderRadius: R.full, alignItems: "center", justifyContent: "center" },
    avgRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: S[3], borderTopWidth: StyleSheet.hairlineWidth, marginTop: S[2] },
    modalButtons: { flexDirection: "row", gap: S[2] },
    modalBtn: { flex: 1, height: 50, borderRadius: R.full, alignItems: "center", justifyContent: "center" },
    modalBtnPrimary: { flex: 2 },
});
