import { authenticatedFetch, getApiBaseUrl } from "./auth";
import { ADMIN_KEY } from "./constants";

const headers = () => ({
  "ADMIN-KEY": ADMIN_KEY,
  "Content-Type": "application/json",
});

export type SurveyOption = {
  id: number;
  tekst: string;
  kolejnosc: number;
  poprawna?: boolean;
  punkty?: number;
  jest_pole_tekstowe: boolean;
};

export type SurveyQuestion = {
  id: number;
  tekst: string;
  typ: "single_choice" | "multi_choice" | "open_text";
  wymagane: boolean;
  kolejnosc: number;
  opcje: SurveyOption[];
  zdjecie?: string | null;
  maks_punkty: number;
};

export type Survey = {
  id: number;
  tytul: string;
  autor: number;
  anonimowa: boolean;
  anonymous_threshold: number;
  data_utworzenia: string;
  aktywna: boolean;
  tryb_quizowy: boolean;
  response_count: number;
  user_has_responded: boolean;
  pytania: SurveyQuestion[];
};

export type SurveyResultOption = {
  id: number;
  tekst: string;
  count: number;
  jest_pole_tekstowe: boolean;
};

export type SurveyResultQuestion = {
  id: number;
  tekst: string;
  typ: string;
  opcje: SurveyResultOption[];
  odpowiedzi_tekstowe: string[];
  maks_punkty: number;
};

export type SurveyResults = {
  survey_id: number;
  tytul: string;
  anonimowa: boolean;
  anonymous_threshold: number;
  response_count: number;
  threshold_reached: boolean;
  is_author: boolean;
  tryb_quizowy: boolean;
  user_has_responded: boolean;
  pytania: SurveyResultQuestion[];
};

export type SubmitResponsePayload = {
  odpowiedzi: {
    pytanie: number;
    wybrane_opcje?: number[];
    tekst_odpowiedzi?: string;
  }[];
};

export const getSurveys = async (): Promise<Survey[]> => {
  try {
    const base = getApiBaseUrl().replace(/\/$/, "");
    const res = await authenticatedFetch(`${base}/api/ankiety/`, {
      headers: headers() as any,
    });
    if (!res?.ok) return [];
    const json = await res.json().catch(() => null);
    if (!json) return [];
    return Array.isArray(json) ? json : (json.results ?? []);
  } catch (e) {
    console.error("[surveys] getSurveys error", e);
    return [];
  }
};

export const getSurveyById = async (id: number): Promise<Survey | null> => {
  try {
    const base = getApiBaseUrl().replace(/\/$/, "");
    const res = await authenticatedFetch(`${base}/api/ankiety/${id}/`, {
      headers: headers() as any,
    });
    if (!res?.ok) return null;
    return await res.json().catch(() => null);
  } catch (e) {
    console.error("[surveys] getSurveyById error", e);
    return null;
  }
};

export const getSurveyResults = async (id: number): Promise<SurveyResults | null> => {
  try {
    const base = getApiBaseUrl().replace(/\/$/, "");
    const res = await authenticatedFetch(`${base}/api/ankiety/${id}/wyniki/`, {
      headers: headers() as any,
    });
    if (!res?.ok) return null;
    return await res.json().catch(() => null);
  } catch (e) {
    console.error("[surveys] getSurveyResults error", e);
    return null;
  }
};

export const submitSurveyResponse = async (
  surveyId: number,
  payload: SubmitResponsePayload,
): Promise<boolean> => {
  try {
    const base = getApiBaseUrl().replace(/\/$/, "");
    const res = await authenticatedFetch(`${base}/api/ankiety/${surveyId}/odpowiedzi/`, {
      method: "POST",
      headers: headers() as any,
      body: JSON.stringify(payload),
    });
    return res?.ok ?? false;
  } catch (e) {
    console.error("[surveys] submitSurveyResponse error", e);
    return false;
  }
};

export const deleteSurvey = async (id: number): Promise<boolean> => {
  try {
    const base = getApiBaseUrl().replace(/\/$/, "");
    const res = await authenticatedFetch(`${base}/api/ankiety/${id}/`, {
      method: "DELETE",
      headers: headers() as any,
    });
    return res?.ok ?? false;
  } catch (e) {
    console.error("[surveys] deleteSurvey error", e);
    return false;
  }
};
