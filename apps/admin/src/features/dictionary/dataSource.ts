import { api } from "@/lib/auth";

type AdminWordsApi = typeof api.words;
type AdminPartOfSpeechSettingsApi = typeof api.partOfSpeechSettings;

export type AdminWordsDataSource = AdminWordsApi;

export type AdminPartOfSpeechDataSource = Pick<
  AdminPartOfSpeechSettingsApi,
  | "catalog"
  | "list"
  | "create"
  | "update"
  | "remove"
  | "listSubParts"
  | "createSubPart"
  | "updateSubPart"
  | "removeSubPart"
  | "listFormTypes"
  | "createFormType"
  | "updateFormType"
  | "removeFormType"
>;

export const adminWordsDataSourceCapabilities = Object.freeze({
  phraseCreation: true,
  archive: true,
  batchArchive: true,
  permanentDelete: true,
  batchPermanentDelete: true
});

export const adminWordsDataSource: AdminWordsDataSource = api.words;

export const partOfSpeechDataSource: AdminPartOfSpeechDataSource =
  api.partOfSpeechSettings;
