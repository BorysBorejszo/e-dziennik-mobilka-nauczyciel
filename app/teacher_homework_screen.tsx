import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { createHomework, deleteHomework, getHomeworkForClass, HomeworkItem } from "./api/homework";
import { getClasses, getSubjects, SchoolClass, Subject } from "./api/teacher";
import Header from "./components/Header";
import SafeView from "./components/SafeView";
import DatePickerField from "./components/ui/DatePickerField";
import { R, S, T, cardShadow, getEditorialPalette } from "./theme/editorial";
import { useTheme } from "./theme/ThemeContext";

type PickerModalProps = {
  visible: boolean;
  title: string;
  items: { id: number; label: string }[];
  selected: number | null;
  onSelect: (id: number) => void;
  onClose: () => void;
  palette: ReturnType<typeof getEditorialPalette>;
};

function PickerModal({ visible, title, items, selected, onSelect, onClose, palette }: PickerModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose} />
      <View style={[styles.pickerSheet, { backgroundColor: palette.surface }]}>
        <View style={styles.pickerHeader}>
          <Text style={[T.headingSmall, { color: palette.text }]}>{title}</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={palette.textSoft} />
          </TouchableOpacity>
        </View>
        <ScrollView>
          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.pickerItem,
                { borderBottomColor: palette.outline },
                selected === item.id && { backgroundColor: palette.primaryFixed },
              ]}
              onPress={() => { onSelect(item.id); onClose(); }}
            >
              <Text style={[T.bodyMedium, { color: selected === item.id ? palette.primary : palette.text }]}>
                {item.label}
              </Text>
              {selected === item.id && (
                <Ionicons name="checkmark" size={18} color={palette.primary} />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function TeacherHomeworkScreen() {
  const { theme } = useTheme();
  const palette = getEditorialPalette(theme);
  const shadow = cardShadow(theme);

  const [homework, setHomework] = useState<HomeworkItem[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // form state
  const [formVisible, setFormVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tytul, setTytul] = useState("");
  const [opis, setOpis] = useState("");
  const [termin, setTermin] = useState("");
  const [selectedClass, setSelectedClass] = useState<number | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<number | null>(null);
  const [classPickerOpen, setClassPickerOpen] = useState(false);
  const [subjectPickerOpen, setSubjectPickerOpen] = useState(false);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [hw, cls, subj] = await Promise.all([
        getHomeworkForClass(),
        getClasses(),
        getSubjects(),
      ]);
      setHomework(hw);
      setClasses(cls);
      setSubjects(subj);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const resetForm = () => {
    setTytul("");
    setOpis("");
    setTermin("");
    setSelectedClass(null);
    setSelectedSubject(null);
  };

  const handleSave = async () => {
    if (!tytul.trim()) {
      Alert.alert("Błąd", "Tytuł jest wymagany.");
      return;
    }
    setSaving(true);
    try {
      const result = await createHomework({
        tytul: tytul.trim(),
        opis: opis.trim() || undefined,
        termin: termin.trim() || undefined,
        klasa: selectedClass ?? undefined,
        przedmiot: selectedSubject ?? undefined,
      });
      if (!result) {
        Alert.alert("Błąd", "Nie udało się dodać pracy domowej.");
        return;
      }
      setFormVisible(false);
      resetForm();
      void load(true);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item: HomeworkItem) => {
    Alert.alert(
      "Usuń pracę domową",
      `Usunąć "${item.description || "pracę domową"}"?`,
      [
        { text: "Anuluj", style: "cancel" },
        {
          text: "Usuń",
          style: "destructive",
          onPress: async () => {
            await deleteHomework(item.id);
            void load(true);
          },
        },
      ]
    );
  };

  const classLabel = selectedClass
    ? (classes.find((c) => c.id === selectedClass)?.nazwa ?? "Klasa")
    : "Wybierz klasę";

  const subjectLabel = selectedSubject
    ? (subjects.find((s) => s.id === selectedSubject)?.nazwa ?? "Przedmiot")
    : "Wybierz przedmiot";

  const dueLabel = (due: string) => {
    if (!due) return null;
    const d = new Date(due);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" });
  };

  return (
    <SafeView edges={["top"]} style={{ flex: 1, backgroundColor: palette.background }}>
      <Header title="Prace domowe" onBack={() => router.back()} />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); void load(true); }}
            tintColor={palette.primary}
          />
        }
      >
        <View style={styles.body}>
          {loading ? (
            <ActivityIndicator color={palette.primary} style={{ marginTop: S[8] }} />
          ) : homework.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="document-text-outline" size={48} color={palette.textSoft} />
              <Text style={[T.bodyMedium, { color: palette.textSoft, marginTop: S[3] }]}>
                Brak prac domowych
              </Text>
            </View>
          ) : (
            homework.map((hw) => {
              const due = dueLabel(hw.due);
              return (
                <View
                  key={hw.id}
                  style={[styles.card, { backgroundColor: palette.surface, borderLeftColor: palette.primary }, shadow]}
                >
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={[T.bodyMedium, { color: palette.text }]} numberOfLines={2}>
                        {hw.description || "—"}
                      </Text>
                      <View style={styles.badges}>
                        {hw.subject ? (
                          <View style={[styles.badge, { backgroundColor: palette.primaryFixed }]}>
                            <Text style={[T.label, { color: palette.primary }]}>{hw.subject}</Text>
                          </View>
                        ) : null}
                        {hw.classId ? (
                          <View style={[styles.badge, { backgroundColor: palette.surfaceMid }]}>
                            <Text style={[T.label, { color: palette.textSoft }]}>
                              {classes.find((c) => c.id === hw.classId)?.nazwa ?? `Klasa ${hw.classId}`}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <View style={styles.cardRight}>
                      {due ? (
                        <Text style={[T.label, { color: palette.textSoft, textAlign: "right" }]}>{due}</Text>
                      ) : null}
                      <TouchableOpacity onPress={() => handleDelete(hw)} style={styles.deleteBtn}>
                        <Ionicons name="trash-outline" size={18} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: palette.primary }]}
        onPress={() => setFormVisible(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Add homework modal */}
      <Modal visible={formVisible} transparent animationType="slide" onRequestClose={() => setFormVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setFormVisible(false)} />
        <View style={[styles.formSheet, { backgroundColor: palette.surface }]}>
          <View style={styles.formHeader}>
            <Text style={[T.headingSmall, { color: palette.text }]}>Nowa praca domowa</Text>
            <TouchableOpacity onPress={() => setFormVisible(false)}>
              <Ionicons name="close" size={22} color={palette.textSoft} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.formBody}>
              {/* Tytuł */}
              <Text style={[T.labelBold, { color: palette.textSoft, marginBottom: S[1] }]}>Tytuł *</Text>
              <TextInput
                value={tytul}
                onChangeText={setTytul}
                placeholder="np. Zadanie z matematyki"
                placeholderTextColor={palette.textMuted}
                style={[styles.input, { backgroundColor: palette.background, borderColor: palette.outline, color: palette.text }]}
              />

              {/* Opis */}
              <Text style={[T.labelBold, { color: palette.textSoft, marginBottom: S[1], marginTop: S[3] }]}>Opis</Text>
              <TextInput
                value={opis}
                onChangeText={setOpis}
                placeholder="Opcjonalny opis zadania…"
                placeholderTextColor={palette.textMuted}
                multiline
                numberOfLines={3}
                style={[styles.input, styles.inputMultiline, { backgroundColor: palette.background, borderColor: palette.outline, color: palette.text }]}
              />

              {/* Termin */}
              <View style={{ marginTop: S[3] }}>
                <DatePickerField
                  value={termin || undefined}
                  onChange={setTermin}
                  label="Termin oddania"
                />
              </View>

              {/* Klasa */}
              <Text style={[T.labelBold, { color: palette.textSoft, marginBottom: S[1], marginTop: S[3] }]}>Klasa</Text>
              <TouchableOpacity
                style={[styles.input, styles.selectInput, { backgroundColor: palette.background, borderColor: palette.outline }]}
                onPress={() => setClassPickerOpen(true)}
              >
                <Text style={[T.body, { color: selectedClass ? palette.text : palette.textMuted }]}>{classLabel}</Text>
                <Ionicons name="chevron-down" size={18} color={palette.textSoft} />
              </TouchableOpacity>

              {/* Przedmiot */}
              <Text style={[T.labelBold, { color: palette.textSoft, marginBottom: S[1], marginTop: S[3] }]}>Przedmiot</Text>
              <TouchableOpacity
                style={[styles.input, styles.selectInput, { backgroundColor: palette.background, borderColor: palette.outline }]}
                onPress={() => setSubjectPickerOpen(true)}
              >
                <Text style={[T.body, { color: selectedSubject ? palette.text : palette.textMuted }]}>{subjectLabel}</Text>
                <Ionicons name="chevron-down" size={18} color={palette.textSoft} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: palette.primary, opacity: saving ? 0.6 : 1 }]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[T.labelBold, { color: "#fff" }]}>Dodaj pracę domową</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Class picker */}
      <PickerModal
        visible={classPickerOpen}
        title="Wybierz klasę"
        items={classes.map((c) => ({ id: c.id, label: c.nazwa }))}
        selected={selectedClass}
        onSelect={setSelectedClass}
        onClose={() => setClassPickerOpen(false)}
        palette={palette}
      />

      {/* Subject picker */}
      <PickerModal
        visible={subjectPickerOpen}
        title="Wybierz przedmiot"
        items={subjects.map((s) => ({ id: s.id, label: s.nazwa }))}
        selected={selectedSubject}
        onSelect={setSelectedSubject}
        onClose={() => setSubjectPickerOpen(false)}
        palette={palette}
      />
    </SafeView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: S[4], paddingBottom: 120, paddingTop: S[2] },
  emptyWrap: { alignItems: "center", marginTop: 80 },
  card: {
    borderRadius: R.lg,
    padding: S[4],
    marginBottom: S[3],
    borderLeftWidth: 4,
  },
  cardTop: { flexDirection: "row", gap: S[3] },
  cardRight: { alignItems: "flex-end", justifyContent: "space-between", minWidth: 80 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: S[1], marginTop: S[1] },
  badge: {
    paddingHorizontal: S[2],
    paddingVertical: 2,
    borderRadius: R.sm,
  },
  deleteBtn: { marginTop: S[2], padding: S[1] },
  fab: {
    position: "absolute",
    bottom: 32,
    right: 24,
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
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  formSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "80%",
    paddingTop: S[4],
  },
  formHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: S[5],
    paddingBottom: S[3],
  },
  formBody: { paddingHorizontal: S[5], paddingBottom: 40 },
  input: {
    borderWidth: 1.5,
    borderRadius: R.md,
    paddingHorizontal: S[3],
    paddingVertical: S[2] + 2,
    fontSize: 15,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  selectInput: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  saveBtn: {
    borderRadius: R.md,
    paddingVertical: S[3] + 2,
    alignItems: "center",
    marginTop: S[5],
  },
  pickerSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "60%",
    paddingTop: S[4],
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: S[5],
    paddingBottom: S[3],
  },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: S[5],
    paddingVertical: S[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
