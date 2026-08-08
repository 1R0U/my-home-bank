import assert from "node:assert/strict";
import test from "node:test";
import {
  INITIAL_ONBOARDING_PROFILE,
  updateOnboardingProfile,
} from "../lib/onboardingProfile.ts";

test("初期設定の入力内容を保持して更新できる", () => {
  const profile = updateOnboardingProfile(INITIAL_ONBOARDING_PROFILE, {
    name: "たろう",
    birthYear: "2015",
    birthMonth: "4",
    birthDay: "12",
    gender: "male",
    familyRole: "child",
  });
  const updatedProfile = updateOnboardingProfile(profile, { birthMonth: "04" });

  assert.deepEqual(updatedProfile, {
    name: "たろう",
    birthYear: "2015",
    birthMonth: "04",
    birthDay: "12",
    gender: "male",
    familyRole: "child",
  });
});
