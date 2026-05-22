import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import {
    Alert,
    Modal,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { getClasses, getSubjects, SchoolClass, Subject } from "../api/teacher";
import {
    createEvent,
    CreateEventPayload,
    deleteEvent,
    EventKind,
    getEvents,
    getTeacherSchedule,
    TeacherLesson,
    updateEvent,
    WydarzenieEntry,
} from "../api/teacher_schedule";
import ErrorState from "../components/ErrorState";
import Header from "../components/Header";
import { SegmentedControl } from "../components/editorial/MobileBlocks";
import { R, S, T, cardShadow, getEditorialPalette } from "../theme/editorial";
import { useTheme } from "../theme/ThemeContext";

const DAY_LABELS = ["Pon", "Wt", "Śr", "Czw", "Pt"];
const DAY_FULL = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek"];
const CELL_W = 78;
const TIME_COL_W = 48;

const EVENT_KINDS: { key: EventKind; label: string; prefix: string }[] = [
    { key: "sprawdzian",   label: "Sprawdzian",   prefix: "Sprawdzian" },
    { key: "kartkowka",    label: "Kartkówka",     prefix: "Kartkówka" },
    { key: "praca_domowa", label: "Praca domowa",  prefix: "Praca domowa" },
    { key: "wydarzenie",   label: "Wydarzenie",    prefix: "" },
];

function todayDayIndex(): number {
    const d = new Date().getDay(); // 0=Sun, 1=Mon …
    if (d === 0 || d === 6) return 0;
    return d - 1;
}

function todayIso(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function isValidDate(s: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());
}

function isValidTime(s: string): boolean {
    return /^\d{2}:\d{2}$/.test(s);
}

export default function TeacherSchedule() {
    const { theme } = useTheme();
    const palette = getEditorialPalette(theme);
    const shadow = cardShadow(theme);

    const [lessons, setLessons] = useState<TeacherLesson[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [selectedDay, setSelectedDay] = useState(todayDayIndex());
    const [viewMode, setViewMode] = useState<"day" | "week" | "events">("day");

    // ── events list ───────────────────────────────────────────────────────────
    const [events, setEvents] = useState<WydarzenieEntry[]>([]);
    const [eventsLoading, setEventsLoading] = useState(false);
    const [editingEvent, setEditingEvent] = useState<WydarzenieEntry | null>(null);

    // ── event creation/edit modal ─────────────────────────────────────────────
    const [modalOpen, setModalOpen] = useState(false);
    const [classes, setClasses] = useState<SchoolClass[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [eventKind, setEventKind] = useState<EventKind>("sprawdzian");
    const [eventTitle, setEventTitle] = useState("");
    const [eventDate, setEventDate] = useState(todayIso());
    const [eventFrom, setEventFrom] = useState("");
    const [eventTo, setEventTo] = useState("");
    const [eventDesc, setEventDesc] = useState("");
    const [selectedClass, setSelectedClass] = useState<SchoolClass | null>(null);
    const [showClassPicker, setShowClassPicker] = useState(false);
    const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
    const [showSubjectPicker, setShowSubjectPicker] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // ── load ──────────────────────────────────────────────────────────────────
    const load = async () => {
        setFetchError(null);
        try {
            const data = await getTeacherSchedule();
            setLessons(data);
        } catch (err) {
            setFetchError(err instanceof Error ? err.message : 'Nie udało się pobrać danych.');
        } finally {
            setLoading(false);
        }
    };

    const loadPickerData = async () => {
        const [cls, sub] = await Promise.all([getClasses(), getSubjects()]);
        setClasses(cls.sort((a, b) => (a.nazwa ?? "").localeCompare(b.nazwa ?? "")));
        setSubjects(sub);
    };

    const loadEvents = async () => {
        setEventsLoading(true);
        const data = await getEvents();
        setEvents(data.sort((a, b) => a.data.localeCompare(b.data)));
        setEventsLoading(false);
    };

    useEffect(() => { void load(); }, [reloadKey]);

    useEffect(() => {
        if (viewMode === "events") void loadEvents();
    }, [viewMode]);

    const onRefresh = async () => {
        setRefreshing(true);
        await Promise.all([load(), viewMode === "events" ? loadEvents() : Promise.resolve()]);
        setRefreshing(false);
    };

    const openModal = () => {
        void loadPickerData();
        setEditingEvent(null);
        setEventKind("sprawdzian");
        setEventTitle("");
        setEventDate(todayIso());
        setEventFrom("");
        setEventTo("");
        setEventDesc("");
        setSelectedClass(null);
        setSelectedSubject(null);
        setShowClassPicker(false);
        setShowSubjectPicker(false);
        setModalOpen(true);
    };

    const openEditModal = (ev: WydarzenieEntry) => {
        void loadPickerData().then(() => {
            setEditingEvent(ev);
            setEventKind("wydarzenie");
            setEventTitle(ev.tytul);
            setEventDate(ev.data);
            setEventFrom(ev.godzina_od?.slice(0, 5) ?? "");
            setEventTo(ev.godzina_do?.slice(0, 5) ?? "");
            setEventDesc(ev.opis ?? "");
            setSelectedClass(classes.find((c) => c.id === ev.klasa) ?? null);
            setSelectedSubject(subjects.find((s) => s.id === ev.przedmiot) ?? null);
            setShowClassPicker(false);
            setShowSubjectPicker(false);
            setModalOpen(true);
        });
    };

    const handleDelete = (ev: WydarzenieEntry) => {
        Alert.alert(
            "Usuń wydarzenie",
            `Czy na pewno chcesz usunąć „${ev.tytul}"?`,
            [
                { text: "Anuluj", style: "cancel" },
                {
                    text: "Usuń",
                    style: "destructive",
                    onPress: async () => {
                        const ok = await deleteEvent(ev.id);
                        if (ok) {
                            setEvents((prev) => prev.filter((e) => e.id !== ev.id));
                        } else {
                            Alert.alert("Błąd", "Nie udało się usunąć wydarzenia");
                        }
                    },
                },
            ]
        );
    };

    // ── submit (create or edit) ───────────────────────────────────────────────
    const handleSubmit = async () => {
        if (!eventTitle.trim()) { Alert.alert("Błąd", "Podaj tytuł wydarzenia"); return; }
        if (!isValidDate(eventDate)) { Alert.alert("Błąd", "Nieprawidłowa data (RRRR-MM-DD)"); return; }
        if (!isValidTime(eventFrom)) { Alert.alert("Błąd", "Podaj godzinę od (HH:MM)"); return; }
        if (!isValidTime(eventTo))   { Alert.alert("Błąd", "Podaj godzinę do (HH:MM)"); return; }

        const payload: CreateEventPayload = {
            tytul: eventTitle.trim(),
            opis: eventDesc.trim(),
            data: eventDate,
            calodobowe: false,
            godzina_od: eventFrom,
            godzina_do: eventTo,
            ...(selectedClass   ? { klasa: selectedClass.id }     : {}),
            ...(selectedSubject ? { przedmiot: selectedSubject.id } : {}),
        };

        setSubmitting(true);
        const isEdit = editingEvent !== null;
        const ok = isEdit
            ? await updateEvent(editingEvent!.id, payload)
            : await createEvent(payload);
        setSubmitting(false);

        if (ok) {
            setModalOpen(false);
            if (isEdit) {
                // update local list without refetch
                const updated: WydarzenieEntry = {
                    ...editingEvent!,
                    ...payload,
                    klasa: selectedClass?.id ?? null,
                    przedmiot: selectedSubject?.id ?? null,
                };
                setEvents((prev) =>
                    prev.map((e) => (e.id === updated.id ? updated : e))
                        .sort((a, b) => a.data.localeCompare(b.data))
                );
            }
            Alert.alert("Sukces", isEdit ? "Wydarzenie zostało zaktualizowane" : "Wydarzenie zostało dodane do kalendarza");
        } else {
            Alert.alert("Błąd", isEdit ? "Nie udało się zaktualizować wydarzenia" : "Nie udało się dodać wydarzenia");
        }
    };

    // ── derived ───────────────────────────────────────────────────────────────
    const dayLessons = lessons.filter((l) => l.dayIndex === selectedDay);

    // ── events view ───────────────────────────────────────────────────────────
    const eventAccent = (title: string) => {
        const t = title.toLowerCase();
        if (t.startsWith("sprawdzian")) return "#EF4444";
        if (t.startsWith("kartkówka") || t.startsWith("kartkowka")) return "#F97316";
        if (t.startsWith("praca domowa")) return "#3B82F6";
        return "#8B5CF6";
    };

    const renderEventsView = () => {
        if (eventsLoading) {
            return (
                <View style={[styles.emptyCard, { backgroundColor: palette.surface }, shadow]}>
                    <Text style={[T.body, { color: palette.textSoft }]}>Ładowanie wydarzeń...</Text>
                </View>
            );
        }
        if (events.length === 0) {
            return (
                <View style={[styles.emptyCard, { backgroundColor: palette.surface }, shadow]}>
                    <Ionicons name="calendar-outline" size={36} color={palette.textMuted} />
                    <Text style={[T.bodyMedium, { color: palette.textMuted, marginTop: S[2] }]}>Brak wydarzeń</Text>
                    <Text style={[T.label, { color: palette.textMuted, marginTop: S[1] }]}>Dodaj sprawdzian lub kartkówkę przyciskiem +</Text>
                </View>
            );
        }
        return (
            <>
                {events.map((ev) => {
                    const accent = eventAccent(ev.tytul);
                    const subjectName = subjects.find((s) => s.id === ev.przedmiot)?.nazwa;
                    const className = classes.find((c) => c.id === ev.klasa)?.nazwa;
                    return (
                        <View key={ev.id} style={[styles.eventCard, { backgroundColor: palette.surface }, shadow]}>
                            {/* Accent stripe */}
                            <View style={[styles.eventStripe, { backgroundColor: accent }]} />
                            <View style={{ flex: 1 }}>
                                {/* Date + title row */}
                                <View style={styles.eventTitleRow}>
                                    <View style={[styles.eventDateBadge, { backgroundColor: accent + "22" }]}>
                                        <Text style={[T.labelBold, { fontSize: 12, color: accent }]}>{ev.data}</Text>
                                    </View>
                                    {!ev.calodobowe && ev.godzina_od ? (
                                        <Text style={[T.label, { fontSize: 11, color: palette.textMuted }]}>
                                            {ev.godzina_od.slice(0, 5)}–{ev.godzina_do?.slice(0, 5) ?? ""}
                                        </Text>
                                    ) : null}
                                </View>
                                <Text style={[T.bodyMedium, { color: palette.text, marginTop: S[1] }]} numberOfLines={2}>
                                    {ev.tytul}
                                </Text>
                                {/* Class / subject chips */}
                                {(className || subjectName) ? (
                                    <View style={styles.eventChips}>
                                        {className && (
                                            <View style={[styles.eventChip, { backgroundColor: palette.inputSurface }]}>
                                                <Text style={[T.label, { fontSize: 11, color: palette.text }]}>{className}</Text>
                                            </View>
                                        )}
                                        {subjectName && (
                                            <View style={[styles.eventChip, { backgroundColor: palette.inputSurface }]}>
                                                <Text style={[T.label, { fontSize: 11, color: palette.text }]}>{subjectName}</Text>
                                            </View>
                                        )}
                                    </View>
                                ) : null}
                                {ev.opis ? (
                                    <Text style={[T.label, { color: palette.textMuted, marginTop: S[1] }]} numberOfLines={2}>
                                        {ev.opis}
                                    </Text>
                                ) : null}
                                {/* Action buttons */}
                                <View style={styles.eventActions}>
                                    <TouchableOpacity
                                        style={[styles.eventActionBtn, { backgroundColor: palette.inputSurface }]}
                                        onPress={() => openEditModal(ev)}
                                    >
                                        <Ionicons name="pencil-outline" size={15} color={palette.text} />
                                        <Text style={[T.labelBold, { fontSize: 12, color: palette.text }]}>Edytuj</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.eventActionBtn, { backgroundColor: palette.dangerBg ?? "#FEE2E2" }]}
                                        onPress={() => handleDelete(ev)}
                                    >
                                        <Ionicons name="trash-outline" size={15} color={palette.danger ?? "#EF4444"} />
                                        <Text style={[T.labelBold, { fontSize: 12, color: palette.danger ?? "#EF4444" }]}>Usuń</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    );
                })}
            </>
        );
    };

    // ── week view ─────────────────────────────────────────────────────────────
    const renderWeekView = () => {
        const slotNumbers = [...new Set(lessons.map((l) => l.lessonNumber))].sort((a, b) => a - b);
        const todayIdx = todayDayIndex();

        // grid[dayIndex][lessonNumber] = lesson
        const grid: Map<number, TeacherLesson>[] = Array.from({ length: 5 }, () => new Map());
        for (const l of lessons) {
            if (l.dayIndex >= 0 && l.dayIndex < 5) grid[l.dayIndex].set(l.lessonNumber, l);
        }

        if (slotNumbers.length === 0) {
            return (
                <View style={[styles.emptyCard, { backgroundColor: palette.surface }, shadow]}>
                    <Ionicons name="calendar-outline" size={36} color={palette.textMuted} />
                    <Text style={[T.bodyMedium, { color: palette.textMuted, marginTop: S[2] }]}>Brak zajęć w tym tygodniu</Text>
                </View>
            );
        }

        return (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.weekScroll}>
                <View>
                    {/* Day header row */}
                    <View style={styles.weekHeaderRow}>
                        <View style={{ width: TIME_COL_W }} />
                        {DAY_LABELS.map((lbl, i) => (
                            <View
                                key={i}
                                style={[
                                    styles.weekDayHeader,
                                    { backgroundColor: i === todayIdx ? palette.primaryFixed : "transparent" },
                                ]}
                            >
                                <Text style={[T.labelBold, { fontSize: 12, color: i === todayIdx ? palette.primary : palette.textSoft }]}>
                                    {lbl}
                                </Text>
                                {i === todayIdx && (
                                    <View style={[styles.todayDot, { backgroundColor: palette.primary }]} />
                                )}
                            </View>
                        ))}
                    </View>

                    {/* Lesson slot rows */}
                    {slotNumbers.map((slotNum) => {
                        const anyLesson = lessons.find((l) => l.lessonNumber === slotNum);
                        return (
                            <View key={slotNum} style={styles.weekRow}>
                                {/* Time column */}
                                <View style={[styles.weekTimeCell, { backgroundColor: palette.surface }]}>
                                    <Text style={[T.labelBold, { fontSize: 15, color: palette.primary, lineHeight: 18 }]}>
                                        {slotNum}
                                    </Text>
                                    {anyLesson?.timeFrom ? (
                                        <Text style={[T.label, { fontSize: 9, color: palette.textMuted, marginTop: 1 }]}>
                                            {anyLesson.timeFrom}
                                        </Text>
                                    ) : null}
                                </View>

                                {/* Day cells */}
                                {[0, 1, 2, 3, 4].map((dayIdx) => {
                                    const lesson = grid[dayIdx].get(slotNum);
                                    return (
                                        <View
                                            key={dayIdx}
                                            style={[
                                                styles.weekCell,
                                                {
                                                    backgroundColor: lesson
                                                        ? dayIdx === todayIdx
                                                            ? palette.primaryFixed
                                                            : palette.surface
                                                        : "transparent",
                                                },
                                            ]}
                                        >
                                            {lesson ? (
                                                <>
                                                    <Text
                                                        numberOfLines={2}
                                                        style={[T.labelBold, { fontSize: 11, color: palette.text, lineHeight: 14 }]}
                                                    >
                                                        {lesson.subject}
                                                    </Text>
                                                    {lesson.classes.length > 0 && (
                                                        <Text
                                                            numberOfLines={1}
                                                            style={[T.label, { fontSize: 9, color: palette.textSoft, marginTop: 1 }]}
                                                        >
                                                            {lesson.classes.join(", ")}
                                                        </Text>
                                                    )}
                                                    <View style={[styles.weekRoomBadge, { backgroundColor: palette.inputSurface }]}>
                                                        <Text style={[T.label, { fontSize: 9, color: palette.textMuted }]}>
                                                            {lesson.room}
                                                        </Text>
                                                    </View>
                                                </>
                                            ) : null}
                                        </View>
                                    );
                                })}
                            </View>
                        );
                    })}
                </View>
            </ScrollView>
        );
    };

    // ── render helpers ────────────────────────────────────────────────────────
    const renderPicker = (
        label: string,
        value: string | null,
        placeholder: string,
        isOpen: boolean,
        onToggle: () => void,
        children: React.ReactNode,
    ) => (
        <View style={styles.formRow}>
            <Text style={[T.labelBold, styles.formLabel, { color: palette.textSoft }]}>{label}</Text>
            <TouchableOpacity
                style={[styles.selector, { backgroundColor: palette.inputSurface }]}
                onPress={onToggle}
            >
                <Text style={[T.body, { color: value ? palette.text : palette.textSoft, flex: 1 }]}>
                    {value ?? placeholder}
                </Text>
                <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={16} color={palette.textSoft} />
            </TouchableOpacity>
            {isOpen && (
                <View style={[styles.dropdown, { backgroundColor: palette.inputSurface }]}>
                    <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={{ maxHeight: 180 }}>
                        {children}
                    </ScrollView>
                </View>
            )}
        </View>
    );

    // ── render ────────────────────────────────────────────────────────────────
    if (fetchError !== null) {
        return (
            <View style={{ flex: 1, backgroundColor: palette.background }}>
                <Header title="Plan lekcji" subtitle="Twój tygodniowy plan zajęć" />
                <ErrorState message={fetchError} onRetry={() => setReloadKey(k => k + 1)} />
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: palette.background }}>
            <Header title="Plan lekcji" subtitle="Twój tygodniowy plan zajęć" />
            <ScrollView
                style={{ flex: 1 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >

                {/* View mode switcher */}
                <View style={styles.modeSwitcher}>
                    <SegmentedControl
                        value={viewMode}
                        onChange={setViewMode}
                        options={[
                            { key: "day", label: "Dzień" },
                            { key: "week", label: "Tydzień" },
                            { key: "events", label: "Wydarzenia" },
                        ]}
                    />
                </View>

                {/* Day tabs — only in day view */}
                {viewMode === "day" && (
                    <View style={[styles.dayTabs, { backgroundColor: palette.surface }]}>
                        {DAY_LABELS.map((lbl, i) => {
                            const active = i === selectedDay;
                            const isToday = i === todayDayIndex();
                            return (
                                <TouchableOpacity
                                    key={i}
                                    style={[styles.dayTab, active && { backgroundColor: palette.primary, borderRadius: R.md }]}
                                    onPress={() => setSelectedDay(i)}
                                >
                                    <Text style={[T.labelBold, { fontSize: 13, color: active ? palette.onPrimary : palette.textSoft }]}>
                                        {lbl}
                                    </Text>
                                    {isToday && (
                                        <View style={[styles.todayDot, { backgroundColor: active ? palette.onPrimary : palette.primary }]} />
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}

                <View style={styles.body}>
                    {viewMode === "events" ? renderEventsView()
                    : viewMode === "week" ? (
                        loading ? (
                            <View style={[styles.emptyCard, { backgroundColor: palette.surface }, shadow]}>
                                <Text style={[T.body, { color: palette.textSoft }]}>Ładowanie planu...</Text>
                            </View>
                        ) : renderWeekView()
                    ) : (
                        <>
                            <View style={styles.sectionHeader}>
                                <Text style={[T.eyebrow, { color: palette.textSoft }]}>{DAY_FULL[selectedDay].toUpperCase()}</Text>
                            </View>

                            {loading ? (
                                <View style={[styles.emptyCard, { backgroundColor: palette.surface }, shadow]}>
                                    <Text style={[T.body, { color: palette.textSoft }]}>Ładowanie planu...</Text>
                                </View>
                            ) : dayLessons.length === 0 ? (
                                <View style={[styles.emptyCard, { backgroundColor: palette.surface }, shadow]}>
                                    <Ionicons name="calendar-outline" size={36} color={palette.textMuted} />
                                    <Text style={[T.bodyMedium, { color: palette.textMuted, marginTop: S[2] }]}>
                                        Brak zajęć
                                    </Text>
                                    <Text style={[T.label, { color: palette.textMuted, marginTop: S[1] }]}>
                                        Nie masz zajęć w {DAY_FULL[selectedDay].toLowerCase()}
                                    </Text>
                                </View>
                            ) : (
                                dayLessons.map((lesson, idx) => (
                                    <View
                                        key={lesson.id !== undefined && !Number.isNaN(lesson.id) ? lesson.id : idx}
                                        style={[styles.lessonCard, { backgroundColor: palette.surface }, shadow]}
                                    >
                                        {/* Left: number + time */}
                                        <View style={[styles.lessonTime, { backgroundColor: palette.primaryFixed }]}>
                                            <Text style={[T.labelBold, { color: palette.primary, fontSize: 18, lineHeight: 22 }]}>
                                                {lesson.lessonNumber}
                                            </Text>
                                            {lesson.timeFrom ? (
                                                <Text style={[T.label, { color: palette.primary, fontSize: 10, marginTop: 2 }]}>
                                                    {lesson.timeFrom}
                                                </Text>
                                            ) : null}
                                            {lesson.timeTo ? (
                                                <Text style={[T.label, { color: palette.primary, fontSize: 10 }]}>
                                                    {lesson.timeTo}
                                                </Text>
                                            ) : null}
                                        </View>

                                        {/* Center: subject + classes */}
                                        <View style={{ flex: 1, marginHorizontal: S[3] }}>
                                            <Text style={[T.bodyMedium, { color: palette.text }]} numberOfLines={1}>
                                                {lesson.subject}
                                            </Text>
                                            {lesson.classes.length > 0 && (
                                                <Text style={[T.label, { color: palette.textSoft, marginTop: 2 }]}>
                                                    {lesson.classes.join(", ")}
                                                </Text>
                                            )}
                                        </View>

                                        {/* Right: room */}
                                        <View style={[styles.roomBadge, { backgroundColor: palette.inputSurface }]}>
                                            <Text style={[T.labelBold, { color: palette.text, fontSize: 12 }]}>
                                                {lesson.room}
                                            </Text>
                                        </View>
                                    </View>
                                ))
                            )}
                        </>
                    )}

                    <View style={{ height: S[8] + 60 }} />
                </View>
            </ScrollView>

            {/* FAB */}
            <TouchableOpacity
                style={[styles.fab, { backgroundColor: palette.primary }]}
                onPress={openModal}
                activeOpacity={0.85}
            >
                <Ionicons name="add" size={28} color={palette.onPrimary} />
            </TouchableOpacity>

            {/* ── Create event modal ──────────────────────────────────────── */}
            <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
                <Pressable style={styles.modalOverlay} onPress={() => setModalOpen(false)}>
                    <View style={[styles.modalCard, { backgroundColor: palette.surface }]} onStartShouldSetResponder={() => true}>
                        {/* Title bar */}
                        <View style={styles.modalTitleRow}>
                            <Text style={[T.bodyMedium, { color: palette.text, fontSize: 17 }]}>
                                {editingEvent ? "Edytuj wydarzenie" : "Nowe wydarzenie"}
                            </Text>
                            <TouchableOpacity onPress={() => setModalOpen(false)}>
                                <Ionicons name="close" size={22} color={palette.textSoft} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: "90%" }}>
                            {/* Event kind chips */}
                            <View style={styles.kindRow}>
                                {EVENT_KINDS.map(({ key, label }) => (
                                    <TouchableOpacity
                                        key={key}
                                        style={[styles.kindChip, { backgroundColor: eventKind === key ? palette.primary : palette.inputSurface }]}
                                        onPress={() => {
                                            setEventKind(key);
                                            const k = EVENT_KINDS.find((e) => e.key === key);
                                            if (k?.prefix && selectedSubject) {
                                                setEventTitle(`${k.prefix} - ${selectedSubject.nazwa}`);
                                            } else if (k?.prefix) {
                                                setEventTitle(k.prefix);
                                            }
                                        }}
                                    >
                                        <Text style={[T.labelBold, { fontSize: 13, color: eventKind === key ? palette.onPrimary : palette.text }]}>
                                            {label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Class picker */}
                            {renderPicker(
                                "Klasa",
                                selectedClass?.nazwa ?? null,
                                "Wybierz klasę...",
                                showClassPicker,
                                () => { setShowClassPicker((v) => !v); setShowSubjectPicker(false); },
                                <>
                                    {classes.map((c) => (
                                        <TouchableOpacity
                                            key={c.id}
                                            style={[styles.dropdownItem, selectedClass?.id === c.id && { backgroundColor: palette.primaryFixed }]}
                                            onPress={() => { setSelectedClass(c); setShowClassPicker(false); }}
                                        >
                                            <Text style={[T.body, { color: palette.text }]}>{c.nazwa}</Text>
                                        </TouchableOpacity>
                                    ))}
                                    {classes.length === 0 && <Text style={[T.label, { color: palette.textMuted, padding: S[3] }]}>Brak klas</Text>}
                                </>
                            )}

                            {/* Subject picker */}
                            {renderPicker(
                                "Przedmiot",
                                selectedSubject?.nazwa ?? null,
                                "Wybierz przedmiot...",
                                showSubjectPicker,
                                () => { setShowSubjectPicker((v) => !v); setShowClassPicker(false); },
                                <>
                                    {subjects.map((s) => (
                                        <TouchableOpacity
                                            key={s.id}
                                            style={[styles.dropdownItem, selectedSubject?.id === s.id && { backgroundColor: palette.primaryFixed }]}
                                            onPress={() => {
                                                setSelectedSubject(s);
                                                setShowSubjectPicker(false);
                                                const k = EVENT_KINDS.find((e) => e.key === eventKind);
                                                if (k?.prefix) setEventTitle(`${k.prefix} - ${s.nazwa}`);
                                            }}
                                        >
                                            <Text style={[T.body, { color: palette.text }]}>{s.nazwa}</Text>
                                        </TouchableOpacity>
                                    ))}
                                    {subjects.length === 0 && <Text style={[T.label, { color: palette.textMuted, padding: S[3] }]}>Brak przedmiotów</Text>}
                                </>
                            )}

                            {/* Title */}
                            <View style={styles.formRow}>
                                <Text style={[T.labelBold, styles.formLabel, { color: palette.textSoft }]}>Tytuł</Text>
                                <TextInput
                                    value={eventTitle}
                                    onChangeText={setEventTitle}
                                    placeholder="np. Sprawdzian z matematyki"
                                    placeholderTextColor={palette.textSoft}
                                    style={[styles.textInput, { backgroundColor: palette.inputSurface, color: palette.text }]}
                                />
                            </View>

                            {/* Date */}
                            <View style={styles.formRow}>
                                <Text style={[T.labelBold, styles.formLabel, { color: palette.textSoft }]}>Data (RRRR-MM-DD)</Text>
                                <TextInput
                                    value={eventDate}
                                    onChangeText={setEventDate}
                                    placeholder="np. 2026-05-20"
                                    placeholderTextColor={palette.textSoft}
                                    keyboardType="numbers-and-punctuation"
                                    style={[styles.textInput, {
                                        backgroundColor: palette.inputSurface,
                                        color: isValidDate(eventDate) ? palette.text : palette.danger,
                                    }]}
                                />
                            </View>

                            {/* Time fields */}
                            <View style={styles.timeRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[T.labelBold, styles.formLabel, { color: palette.textSoft }]}>Godz. od</Text>
                                    <TextInput
                                        value={eventFrom}
                                        onChangeText={setEventFrom}
                                        placeholder="08:00"
                                        placeholderTextColor={palette.textSoft}
                                        keyboardType="numbers-and-punctuation"
                                        style={[styles.textInput, { backgroundColor: palette.inputSurface, color: palette.text }]}
                                    />
                                </View>
                                <View style={{ width: S[3] }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[T.labelBold, styles.formLabel, { color: palette.textSoft }]}>Godz. do</Text>
                                    <TextInput
                                        value={eventTo}
                                        onChangeText={setEventTo}
                                        placeholder="08:45"
                                        placeholderTextColor={palette.textSoft}
                                        keyboardType="numbers-and-punctuation"
                                        style={[styles.textInput, { backgroundColor: palette.inputSurface, color: palette.text }]}
                                    />
                                </View>
                            </View>

                            {/* Description */}
                            <View style={styles.formRow}>
                                <Text style={[T.labelBold, styles.formLabel, { color: palette.textSoft }]}>Opis (opcjonalnie)</Text>
                                <TextInput
                                    value={eventDesc}
                                    onChangeText={setEventDesc}
                                    placeholder="Dodatkowe informacje..."
                                    placeholderTextColor={palette.textSoft}
                                    multiline
                                    numberOfLines={3}
                                    style={[styles.textInput, styles.textArea, { backgroundColor: palette.inputSurface, color: palette.text }]}
                                />
                            </View>

                            <View style={{ height: S[4] }} />

                            {/* Submit */}
                            <TouchableOpacity
                                style={[styles.submitBtn, { backgroundColor: palette.primary, opacity: submitting ? 0.6 : 1 }]}
                                disabled={submitting}
                                onPress={handleSubmit}
                            >
                                <Text style={[T.labelBold, { color: palette.onPrimary, fontSize: 15 }]}>
                                    {submitting
                                        ? (editingEvent ? "Zapisywanie..." : "Dodawanie...")
                                        : (editingEvent ? "Zapisz zmiany" : "Dodaj do kalendarza")}
                                </Text>
                            </TouchableOpacity>

                            <View style={{ height: S[5] }} />
                        </ScrollView>
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    modeSwitcher: {
        paddingHorizontal: S[4],
        paddingBottom: S[2],
    },
    weekScroll: {
        marginBottom: S[3],
    },
    weekHeaderRow: {
        flexDirection: "row",
        paddingHorizontal: S[2],
        marginBottom: 3,
    },
    weekDayHeader: {
        width: CELL_W,
        alignItems: "center",
        paddingVertical: S[2],
        borderRadius: R.md,
        gap: 3,
    },
    weekRow: {
        flexDirection: "row",
        paddingHorizontal: S[2],
        marginBottom: 3,
        alignItems: "stretch",
    },
    weekTimeCell: {
        width: TIME_COL_W,
        minHeight: 72,
        borderRadius: R.md,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 3,
    },
    weekCell: {
        width: CELL_W,
        minHeight: 72,
        borderRadius: R.md,
        padding: 6,
        marginHorizontal: 2,
        justifyContent: "center",
    },
    weekRoomBadge: {
        marginTop: 3,
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderRadius: R.sm,
        alignSelf: "flex-start",
    },
    dayTabs: {
        flexDirection: "row",
        marginHorizontal: S[4],
        borderRadius: R.lg,
        padding: S[1],
        marginBottom: S[2],
    },
    dayTab: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: S[2] + 2,
        gap: 3,
    },
    todayDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
    },
    body: {
        paddingHorizontal: S[4],
    },
    sectionHeader: {
        paddingVertical: S[2],
    },
    lessonCard: {
        flexDirection: "row",
        alignItems: "center",
        borderRadius: R.lg,
        padding: S[3],
        marginBottom: S[3],
    },
    lessonTime: {
        width: 52,
        minHeight: 52,
        borderRadius: R.md,
        alignItems: "center",
        justifyContent: "center",
        padding: S[1],
    },
    roomBadge: {
        paddingHorizontal: S[2] + 2,
        paddingVertical: S[1] + 2,
        borderRadius: R.sm,
    },
    emptyCard: {
        borderRadius: R.lg,
        padding: S[6],
        alignItems: "center",
        justifyContent: "center",
        gap: 0,
    },
    fab: {
        position: "absolute",
        bottom: S[5],
        right: S[5],
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: "center",
        justifyContent: "center",
        elevation: 6,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "flex-end",
    },
    modalCard: {
        borderTopLeftRadius: R.xl,
        borderTopRightRadius: R.xl,
        padding: S[5],
        maxHeight: "92%",
    },
    modalTitleRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: S[4],
    },
    kindRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: S[2],
        marginBottom: S[4],
    },
    kindChip: {
        paddingHorizontal: S[3],
        paddingVertical: S[2],
        borderRadius: R.full,
    },
    formRow: {
        marginBottom: S[3],
    },
    formLabel: {
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
        marginTop: S[1],
        borderRadius: R.md,
        overflow: "hidden",
    },
    dropdownItem: {
        paddingHorizontal: S[3],
        paddingVertical: S[2] + 2,
    },
    textInput: {
        borderRadius: R.md,
        paddingHorizontal: S[3],
        paddingVertical: S[3],
        fontSize: 15,
    },
    textArea: {
        minHeight: 72,
        textAlignVertical: "top",
    },
    toggleRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    timeRow: {
        flexDirection: "row",
        marginBottom: S[3],
    },
    submitBtn: {
        borderRadius: R.full,
        height: 52,
        alignItems: "center",
        justifyContent: "center",
    },
    eventCard: {
        flexDirection: "row",
        borderRadius: R.lg,
        marginBottom: S[3],
        overflow: "hidden",
    },
    eventStripe: {
        width: 4,
    },
    eventTitleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: S[2],
        padding: S[3],
        paddingBottom: S[1],
    },
    eventDateBadge: {
        paddingHorizontal: S[2],
        paddingVertical: 3,
        borderRadius: R.sm,
    },
    eventChips: {
        flexDirection: "row",
        gap: S[1],
        flexWrap: "wrap",
        paddingHorizontal: S[3],
        paddingTop: S[1],
    },
    eventChip: {
        paddingHorizontal: S[2],
        paddingVertical: 3,
        borderRadius: R.full,
    },
    eventActions: {
        flexDirection: "row",
        gap: S[2],
        padding: S[3],
        paddingTop: S[2],
    },
    eventActionBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: S[1],
        paddingHorizontal: S[3],
        paddingVertical: S[2],
        borderRadius: R.full,
    },
});
