import { ESLintUtils } from "@typescript-eslint/utils";
export const createRule = ESLintUtils.RuleCreator((name) => `https://github.com/PlaybookMediaLLC/oppulence/blob/main/clients/apps/desktop/docs/ARCHITECTURE_GAUNTLET.md#${name}`);
