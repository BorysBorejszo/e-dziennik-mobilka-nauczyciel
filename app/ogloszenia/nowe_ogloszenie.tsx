import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import * as React from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import {
    CreateInlineSurveyPayload,
    CreateOptionPayload,
    CreateQuestionPayload,
    createAnnouncement,
} from "../api/announcements";
import { getClasses, SchoolClass } from "../api/teacher";
import SafeView from "../components/SafeView";
import { R, S, T, cardShadow, getEditorialPalette } from "../theme/editorial";
import { useTheme } from "../theme/ThemeContext";

type QuestionDraft = {
    tekst: string;
    typ: "single_choice" | "multi_choice" | "open_text";
    wymagane: boolean;
    opcje: { tekst: string }[];
};

const EMPTY_QUESTION = (): QuestionDraft => ({
    tekst: "",
    typ: "single_choice",
    wymagane: true,
    opcje: [{ tekst: "" }, { tekst: "" }],
});

const QUESTION_TYPE_LABELS: Record<QuestionDraft["typ"], string> = {
    single_choice: "Jeden wybór",
    multi_choice: "Wiele wyborów",
    open_text: "Odpowiedź tekstowa",
};

export default function NoveOgloszenie() {
    const { theme } = useTheme();
    const palette = getEditorialPalette(theme);
    const shadow = cardShadow(theme);

    const [tytul, setTytul] = React.useState("");
    const [tresc, setTresc] = React.useState("");
    const [zasieg, setZasieg] = React.useState<"school" | "class">("school");
    const [selectedKlasy, setSelectedKlasy] = React.useState<number[]>([]);
    const [availableKlasy, setAvailableKlasy] = React.useState<SchoolClass[]>([]);

    const [includeSurvey, setIncludeSurvey] = React.useState(false);
    const [surveyTytul, setSurveyTytul] = React.useState("");
    const [anonimowa, setAnonimowa] = React.useState(false);
    const [questions, setQuestions] = React.useState<QuestionDraft[]>([EMPTY_QUESTION()]);

    const [sending, setSending] = React.useState(false);

    React.useEffect(() => {
        getClasses().then(setAvailableKlasy).catch(() => {});
    }, []);

    const toggleKlasa = (id: number) => {
        setSelectedKlasy((prev) =>
            prev.includes(id) ? prev.filter((k) => k !== id) : [...prev, id],
        );
    };

    // --- Question helpers ---

    const updateQuestion = (idx: number, patch: Partial<QuestionDraft>) => {
        setQuestions((prev) =>
            prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)),
        );
    };

    const addOption = (qIdx: number) => {
        setQuestions((prev) =>
            prev.map((q, i) =>
                i === qIdx ? { ...q, opcje: [...q.opcje, { tekst: "" }] } : q,
            ),
        );
    };

    const updateOption = (qIdx: number, oIdx: number, tekst: string) => {
        setQuestions((prev) =>
            prev.map((q, i) =>
                i === qIdx
                    ? {
                          ...q,
                          opcje: q.opcje.map((o, j) => (j === oIdx ? { tekst } : o)),
                      }
                    : q,
            ),
        );
    };

    const removeOption = (qIdx: number, oIdx: number) => {
        setQuestions((prev) =>
            prev.map((q, i) =>
                i === qIdx
                    ? { ...q, opcje: q.opcje.filter((_, j) => j !== oIdx) }
                    : q,
            ),
        );
    };

    const removeQuestion = (idx: number) => {
        setQuestions((prev) => prev.filter((_, i) => i !== idx));
    };

    // --- Submit ---

    const validate = (): string | null => {
        if (!tytul.trim()) return "Podaj tytuł ogłoszenia.";
        if (!tresc.trim()) return "Podaj treść ogłoszenia.";
        if (zasieg === "class" && selectedKlasy.length === 0)
            return "Wybierz przynajmniej jedną klasę.";
        if (includeSurvey) {
            if (!surveyTytul.trim()) return "Podaj tytuł ankiety.";
            if (questions.length === 0) return "Dodaj przynajmniej jedno pytanie.";
            for (let qi = 0; qi < questions.length; qi++) {
                const q = questions[qi];
                if (!q.tekst.trim())
                    return `Pytanie ${qi + 1}: wpisz treść pytania.`;
                if (q.typ !== "open_text") {
                    if (q.opcje.length < 2)
                        return `Pytanie ${qi + 1}: dodaj co najmniej 2 opcje.`;
                    if (q.opcje.some((o) => !o.tekst.trim()))
                        return `Pytanie ${qi + 1}: uzupełnij wszystkie opcje.`;
                }
            }
        }
        return null;
    };

    const handleSubmit = async () => {
        const err = validate();
        if (err) {
            Alert.alert("Błąd", err);
            return;
        }

        setSending(true);
        try {
            let ankieta: CreateInlineSurveyPayload | undefined;
            if (includeSurvey) {
                ankieta = {
                    tytul: surveyTytul.trim(),
                    anonimowa,
                    anonymous_threshold: anonimowa ? 5 : undefined,
                    pytania: questions.map(
                        (q, qi): CreateQuestionPayload => ({
                            tekst: q.tekst.trim(),
                            typ: q.typ,
                            wymagane: q.wymagane,
                            kolejnosc: qi,
                            opcje:
                                q.typ !== "open_text"
                                    ? q.opcje.map(
                                          (o, oi): CreateOptionPayload => ({
                                              tekst: o.tekst.trim(),
                                              kolejnosc: oi,
                                          }),
                                      )
                                    : undefined,
                        }),
                    ),
                };
            }

            const result = await createAnnouncement({
                tytul: tytul.trim(),
                tresc: tresc.trim(),
                zasieg,
                klasy: zasieg === "class" ? selectedKlasy : [],
                aktywne: true,
                ankieta,
            });

            if (result) {
                Alert.alert("Sukces", "Ogłoszenie zostało opublikowane.", [
                    { text: "OK", onPress: () => router.back() },
                ]);
            } else {
                Alert.alert("Błąd", "Nie udało się opublikować ogłoszenia.");
            }
        } catch {
            Alert.alert("Błąd", "Wystąpił błąd podczas publikowania.");
        } finally {
            setSending(false);
        }
    };

    const inputStyle = [T.body, styles.textInput, { color: palette.text }];
    const cardStyle = [styles.fieldCard, { backgroundColor: palette.surface }, shadow];

    return (
        <SafeView
            edges={["top", "bottom"]}
            style={[styles.root, { backgroundColor: palette.background }]}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.keyboardAvoid}
            >
                <ScrollView
                    stickyHeaderIndices={[0]}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Sticky top bar */}
                    <View style={[styles.topBar, { backgroundColor: palette.background }]}>
                        <TouchableOpacity
                            onPress={() => router.back()}
                            style={[
                                styles.backBtn,
                                { backgroundColor: palette.surfaceGlass },
                                shadow,
                            ]}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="arrow-back" size={22} color={palette.primary} />
                        </TouchableOpacity>
                        <View style={styles.topBarTitle}>
                            <Text style={[T.headline, { color: palette.text }]} numberOfLines={1}>
                                Nowe ogłoszenie
                            </Text>
                        </View>
                    </View>

                    <View style={styles.form}>
                        {/* Tytuł */}
                        <View style={cardStyle}>
                            <Text style={[T.eyebrow, styles.fieldLabel, { color: palette.textSoft }]}>
                                Tytuł *
                            </Text>
                            <TextInput
                                style={inputStyle}
                                placeholder="Tytuł ogłoszenia"
                                placeholderTextColor={palette.textSoft}
                                value={tytul}
                                onChangeText={setTytul}
                            />
                        </View>

                        {/* Treść */}
                        <View style={[...cardStyle, styles.fieldCardMultiline]}>
                            <Text style={[T.eyebrow, styles.fieldLabel, { color: palette.textSoft }]}>
                                Treść *
                            </Text>
                            <TextInput
                                style={[...inputStyle, styles.multilineInput]}
                                placeholder="Treść ogłoszenia..."
                                placeholderTextColor={palette.textSoft}
                                value={tresc}
                                onChangeText={setTresc}
                                multiline
                                numberOfLines={5}
                                textAlignVertical="top"
                            />
                        </View>

                        {/* Zasięg */}
                        <View style={cardStyle}>
                            <Text style={[T.eyebrow, styles.fieldLabel, { color: palette.textSoft }]}>
                                Zasięg
                            </Text>
                            <View style={styles.segmentRow}>
                                {(["school", "class"] as const).map((opt) => (
                                    <TouchableOpacity
                                        key={opt}
                                        onPress={() => setZasieg(opt)}
                                        activeOpacity={0.8}
                                        style={[
                                            styles.segmentBtn,
                                            {
                                                backgroundColor:
                                                    zasieg === opt
                                                        ? palette.primary
                                                        : palette.surfaceMid,
                                            },
                                        ]}
                                    >
                                        <Ionicons
                                            name={opt === "school" ? "globe-outline" : "people-outline"}
                                            size={14}
                                            color={zasieg === opt ? palette.onPrimary : palette.textMuted}
                                        />
                                        <Text
                                            style={[
                                                T.labelBold,
                                                {
                                                    color:
                                                        zasieg === opt
                                                            ? palette.onPrimary
                                                            : palette.textMuted,
                                                    marginLeft: S[1],
                                                },
                                            ]}
                                        >
                                            {opt === "school" ? "Cała szkoła" : "Wybrane klasy"}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Klasy (only when zasieg === "class") */}
                        {zasieg === "class" && availableKlasy.length > 0 && (
                            <View style={cardStyle}>
                                <Text
                                    style={[T.eyebrow, styles.fieldLabel, { color: palette.textSoft }]}
                                >
                                    Klasy *
                                </Text>
                                <View style={styles.classChips}>
                                    {availableKlasy.map((cls) => {
                                        const selected = selectedKlasy.includes(cls.id);
                                        return (
                                            <TouchableOpacity
                                                key={cls.id}
                                                onPress={() => toggleKlasa(cls.id)}
                                                activeOpacity={0.8}
                                                style={[
                                                    styles.classChip,
                                                    {
                                                        backgroundColor: selected
                                                            ? palette.primary
                                                            : palette.surfaceMid,
                                                        borderWidth: 1,
                                                        borderColor: selected
                                                            ? palette.primary
                                                            : palette.outline,
                                                    },
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        T.labelBold,
                                                        {
                                                            color: selected
                                                                ? palette.onPrimary
                                                                : palette.text,
                                                        },
                                                    ]}
                                                >
                                                    {cls.nazwa}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>
                        )}

                        {/* Survey toggle */}
                        <View style={[cardStyle, styles.switchRow]}>
                            <View style={styles.switchLabel}>
                                <Ionicons
                                    name="bar-chart-outline"
                                    size={20}
                                    color={palette.primary}
                                />
                                <View style={{ marginLeft: S[2] }}>
                                    <Text style={[T.bodyMedium, { color: palette.text }]}>
                                        Dołącz ankietę
                                    </Text>
                                    <Text style={[T.meta, { color: palette.textSoft }]}>
                                        Zbierz odpowiedzi od uczniów
                                    </Text>
                                </View>
                            </View>
                            <Switch
                                value={includeSurvey}
                                onValueChange={setIncludeSurvey}
                                trackColor={{
                                    false: palette.surfaceMid,
                                    true: palette.primary,
                                }}
                                thumbColor={palette.onPrimary}
                            />
                        </View>

                        {/* Survey builder */}
                        {includeSurvey && (
                            <>
                                {/* Survey title */}
                                <View style={cardStyle}>
                                    <Text
                                        style={[T.eyebrow, styles.fieldLabel, { color: palette.textSoft }]}
                                    >
                                        Tytuł ankiety *
                                    </Text>
                                    <TextInput
                                        style={inputStyle}
                                        placeholder="Np. Ocena wycieczki szkolnej"
                                        placeholderTextColor={palette.textSoft}
                                        value={surveyTytul}
                                        onChangeText={setSurveyTytul}
                                    />
                                </View>

                                {/* Anonymous toggle */}
                                <View style={[cardStyle, styles.switchRow]}>
                                    <View style={styles.switchLabel}>
                                        <Ionicons
                                            name="eye-off-outline"
                                            size={20}
                                            color={palette.textMuted}
                                        />
                                        <View style={{ marginLeft: S[2] }}>
                                            <Text style={[T.bodyMedium, { color: palette.text }]}>
                                                Anonimowa
                                            </Text>
                                            <Text style={[T.meta, { color: palette.textSoft }]}>
                                                Ukrywa tożsamość respondentów
                                            </Text>
                                        </View>
                                    </View>
                                    <Switch
                                        value={anonimowa}
                                        onValueChange={setAnonimowa}
                                        trackColor={{
                                            false: palette.surfaceMid,
                                            true: palette.primary,
                                        }}
                                        thumbColor={palette.onPrimary}
                                    />
                                </View>

                                {/* Questions */}
                                <View style={styles.questionsSection}>
                                    <Text style={[T.title, { color: palette.text, marginBottom: S[3] }]}>
                                        Pytania
                                    </Text>

                                    {questions.map((q, qi) => (
                                        <View
                                            key={qi}
                                            style={[
                                                styles.questionCard,
                                                { backgroundColor: palette.surface },
                                                shadow,
                                            ]}
                                        >
                                            {/* Question header */}
                                            <View style={styles.questionHeader}>
                                                <View
                                                    style={[
                                                        styles.qNumBadge,
                                                        { backgroundColor: palette.primaryFixed },
                                                    ]}
                                                >
                                                    <Text
                                                        style={[T.labelBold, { color: palette.primary }]}
                                                    >
                                                        {qi + 1}
                                                    </Text>
                                                </View>
                                                <Text
                                                    style={[
                                                        T.labelBold,
                                                        { color: palette.text, flex: 1, marginLeft: S[2] },
                                                    ]}
                                                >
                                                    Pytanie {qi + 1}
                                                </Text>
                                                {questions.length > 1 && (
                                                    <TouchableOpacity
                                                        onPress={() => removeQuestion(qi)}
                                                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                                                    >
                                                        <Ionicons
                                                            name="close-circle-outline"
                                                            size={20}
                                                            color={palette.danger}
                                                        />
                                                    </TouchableOpacity>
                                                )}
                                            </View>

                                            {/* Question text */}
                                            <TextInput
                                                style={[
                                                    inputStyle,
                                                    styles.questionInput,
                                                    {
                                                        backgroundColor: palette.surfaceLow,
                                                        borderRadius: R.md,
                                                        padding: S[3],
                                                    },
                                                ]}
                                                placeholder="Treść pytania..."
                                                placeholderTextColor={palette.textSoft}
                                                value={q.tekst}
                                                onChangeText={(val) =>
                                                    updateQuestion(qi, { tekst: val })
                                                }
                                                multiline
                                            />

                                            {/* Type selector */}
                                            <View style={styles.typeRow}>
                                                {(
                                                    [
                                                        "single_choice",
                                                        "multi_choice",
                                                        "open_text",
                                                    ] as const
                                                ).map((typ) => (
                                                    <TouchableOpacity
                                                        key={typ}
                                                        onPress={() => updateQuestion(qi, { typ })}
                                                        activeOpacity={0.8}
                                                        style={[
                                                            styles.typeChip,
                                                            {
                                                                backgroundColor:
                                                                    q.typ === typ
                                                                        ? palette.primary
                                                                        : palette.surfaceLow,
                                                            },
                                                        ]}
                                                    >
                                                        <Text
                                                            style={[
                                                                T.meta,
                                                                {
                                                                    color:
                                                                        q.typ === typ
                                                                            ? palette.onPrimary
                                                                            : palette.textMuted,
                                                                },
                                                            ]}
                                                        >
                                                            {QUESTION_TYPE_LABELS[typ]}
                                                        </Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>

                                            {/* Options (for choice types) */}
                                            {q.typ !== "open_text" && (
                                                <View style={styles.optionsList}>
                                                    {q.opcje.map((opt, oi) => (
                                                        <View key={oi} style={styles.optionRow}>
                                                            <Ionicons
                                                                name={
                                                                    q.typ === "single_choice"
                                                                        ? "radio-button-off-outline"
                                                                        : "checkbox-outline"
                                                                }
                                                                size={16}
                                                                color={palette.textMuted}
                                                            />
                                                            <TextInput
                                                                style={[
                                                                    T.body,
                                                                    styles.optionInput,
                                                                    { color: palette.text },
                                                                ]}
                                                                placeholder={`Opcja ${oi + 1}`}
                                                                placeholderTextColor={palette.textSoft}
                                                                value={opt.tekst}
                                                                onChangeText={(val) =>
                                                                    updateOption(qi, oi, val)
                                                                }
                                                            />
                                                            {q.opcje.length > 2 && (
                                                                <TouchableOpacity
                                                                    onPress={() => removeOption(qi, oi)}
                                                                    hitSlop={{
                                                                        top: 8,
                                                                        right: 8,
                                                                        bottom: 8,
                                                                        left: 8,
                                                                    }}
                                                                >
                                                                    <Ionicons
                                                                        name="remove-circle-outline"
                                                                        size={18}
                                                                        color={palette.danger}
                                                                    />
                                                                </TouchableOpacity>
                                                            )}
                                                        </View>
                                                    ))}

                                                    <TouchableOpacity
                                                        onPress={() => addOption(qi)}
                                                        style={styles.addOptionBtn}
                                                        activeOpacity={0.7}
                                                    >
                                                        <Ionicons
                                                            name="add-circle-outline"
                                                            size={16}
                                                            color={palette.primary}
                                                        />
                                                        <Text
                                                            style={[
                                                                T.label,
                                                                {
                                                                    color: palette.primary,
                                                                    marginLeft: S[1],
                                                                },
                                                            ]}
                                                        >
                                                            Dodaj opcję
                                                        </Text>
                                                    </TouchableOpacity>
                                                </View>
                                            )}
                                        </View>
                                    ))}

                                    {/* Add question button */}
                                    <TouchableOpacity
                                        onPress={() =>
                                            setQuestions((prev) => [...prev, EMPTY_QUESTION()])
                                        }
                                        activeOpacity={0.8}
                                        style={[
                                            styles.addQuestionBtn,
                                            {
                                                backgroundColor: palette.primaryFixed,
                                                borderColor: palette.primary,
                                            },
                                        ]}
                                    >
                                        <Ionicons
                                            name="add-outline"
                                            size={18}
                                            color={palette.primary}
                                        />
                                        <Text
                                            style={[
                                                T.labelBold,
                                                { color: palette.primary, marginLeft: S[2] },
                                            ]}
                                        >
                                            Dodaj pytanie
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </>
                        )}
                    </View>
                </ScrollView>

                {/* Submit bar */}
                <View
                    style={[styles.submitBar, { backgroundColor: palette.background }]}
                >
                    <TouchableOpacity
                        onPress={() => void handleSubmit()}
                        disabled={sending}
                        activeOpacity={0.85}
                        style={[
                            styles.submitBtn,
                            {
                                backgroundColor: palette.primary,
                                opacity: sending ? 0.6 : 1,
                            },
                        ]}
                    >
                        {sending ? (
                            <ActivityIndicator color={palette.onPrimary} />
                        ) : (
                            <>
                                <Ionicons
                                    name="megaphone-outline"
                                    size={18}
                                    color={palette.onPrimary}
                                    style={{ marginRight: S[2] }}
                                />
                                <Text style={[T.labelBold, { color: palette.onPrimary }]}>
                                    Opublikuj
                                </Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    keyboardAvoid: { flex: 1 },
    scrollContent: { paddingBottom: 100 },

    topBar: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: S[4],
        paddingTop: S[2] + 2,
        paddingBottom: 18,
        zIndex: 20,
    },
    backBtn: {
        width: 48,
        height: 48,
        borderRadius: R.full,
        alignItems: "center",
        justifyContent: "center",
    },
    topBarTitle: {
        flex: 1,
        marginLeft: S[3],
    },

    form: {
        paddingHorizontal: S[4],
        gap: S[3],
    },
    fieldCard: {
        borderRadius: 20,
        paddingHorizontal: S[4],
        paddingVertical: S[3],
    },
    fieldCardMultiline: {
        paddingBottom: S[4],
    },
    fieldLabel: {
        marginBottom: S[2],
    },
    textInput: {
        padding: 0,
        margin: 0,
    },
    multilineInput: {
        minHeight: 100,
        textAlignVertical: "top",
    },

    segmentRow: {
        flexDirection: "row",
        gap: S[2],
    },
    segmentBtn: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: R.lg,
        paddingVertical: S[2] + 2,
        paddingHorizontal: S[2],
    },

    classChips: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: S[2],
    },
    classChip: {
        borderRadius: R.full,
        paddingHorizontal: S[3],
        paddingVertical: S[1] + 2,
    },

    switchRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    switchLabel: {
        flexDirection: "row",
        alignItems: "center",
        flex: 1,
    },

    questionsSection: {
        gap: S[3],
    },
    questionCard: {
        borderRadius: R.lg,
        padding: S[4],
        gap: S[3],
    },
    questionHeader: {
        flexDirection: "row",
        alignItems: "center",
    },
    qNumBadge: {
        width: 28,
        height: 28,
        borderRadius: R.full,
        alignItems: "center",
        justifyContent: "center",
    },
    questionInput: {
        minHeight: 60,
    },

    typeRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: S[2],
    },
    typeChip: {
        borderRadius: R.full,
        paddingHorizontal: S[3],
        paddingVertical: S[1] + 2,
    },

    optionsList: {
        gap: S[2],
    },
    optionRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: S[2],
    },
    optionInput: {
        flex: 1,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "transparent",
        padding: 0,
    },
    addOptionBtn: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: S[1],
    },

    addQuestionBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: R.lg,
        borderWidth: 1,
        borderStyle: "dashed",
        paddingVertical: S[3],
    },

    submitBar: {
        paddingHorizontal: S[4],
        paddingBottom: S[4],
        paddingTop: S[2],
    },
    submitBtn: {
        height: 56,
        borderRadius: R.full,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
    },
});
