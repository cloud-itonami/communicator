;; provenance_test.cljs — migration.edn が名指した出所を、その出所に当てて確かめる。
;;
;; migration.edn は 4 つの測定値を主張する: revision / tree / tracked-files / bytes。
;; どれも `etzhayyim/root` の側にしか答えが無い。**この repo だけを見て確かめる方法は
;; 無い** —— だからこの検査は、出所の checkout が手元に在るときだけ走る。
;;
;; ⚠ 出所が無いときに緑を返してはならない。CLAUDE.md の言い方では「測れなかった検査が、
;; 測って問題が無かった検査と同じ値を返す」形になる。ここは SKIPPED と印字し、
;; runner がそれを合格として数えない。
;;
;;   COMMUNICATOR_SOURCE_REPO=/path/to/etzhayyim/root nbb --classpath test run_tests.cljs
;;
;; 既定の探索先は west のレイアウト（orgs/<org>/<repo>）を前提にした ../../etzhayyim/root。
(ns etzhayyim.communicator.provenance-test
  (:require [clojure.test :refer [deftest is testing]]
            [clojure.edn :as edn]
            [kotoba.lang.text :as str]
            ["fs" :as fs]
            ["path" :as path]
            [etzhayyim.communicator.repo :as repo]))

(def migration (delay (edn/read-string (repo/slurp* "migration.edn"))))

(def source-repo
  (delay
    (let [explicit (.. js/process -env -COMMUNICATOR_SOURCE_REPO)
          guess (path/resolve repo/root ".." ".." "etzhayyim" "root")
          cand (or explicit guess)]
      (when (and cand (fs/existsSync (path/join cand ".git"))) cand))))

(defn- git [cwd args]
  (let [cp (js/require "node:child_process")]
    (str/trim (.execFileSync cp "git" (clj->js args) #js {:cwd cwd :encoding "utf8"}))))

(def skipped (atom []))

(defn- skip! [why]
  (swap! skipped conj why)
  (println (str "  SKIPPED (not a pass): " why))
  nil)

(deftest migration-provenance-matches-the-source-tree
  (repo/refuse-if-not-repo-root!)
  (let [{:keys [source]} @migration
        {:keys [revision path tree tracked-files bytes]} source]
    (is (and revision path tree tracked-files bytes)
        "migration.edn の :source が 5 つの項目を揃えていない")
    (if-not @source-repo
      (skip! (str "source repo not found (set COMMUNICATOR_SOURCE_REPO). "
                  "migration.edn claims revision=" revision " tree=" tree
                  " tracked-files=" tracked-files " bytes=" bytes " — unverified"))
      (let [src @source-repo]
        (cond
          (= "true" (git src ["rev-parse" "--is-shallow-repository"]))
          (skip! (str src " is a shallow clone; its ancestry answers are not trustworthy (ADR-2608124400)"))

          (not= "commit" (try (git src ["cat-file" "-t" revision]) (catch :default _ nil)))
          (skip! (str "revision " revision " is not present in " src))

          :else
          (testing (str "against " src)
            (is (= tree (git src ["rev-parse" (str revision ":" path)]))
                ":tree が出所の実際の tree SHA と一致しない")
            (let [listed (->> (git src ["ls-tree" "-r" "--name-only" revision "--" path])
                              str/split-lines (remove str/blank?) vec)
                  sizes (->> (git src ["ls-tree" "-r" "-l" revision "--" path])
                             str/split-lines (remove str/blank?)
                             (map #(js/parseInt (nth (str/split (str/trim %) #"\s+") 3) 10)))]
              (is (= tracked-files (count listed))
                  (str ":tracked-files=" tracked-files " だが出所は " (count listed) " 件"))
              (is (= bytes (reduce + 0 sizes))
                  (str ":bytes=" bytes " だが出所の合計は " (reduce + 0 sizes))))))))))

(deftest the-tree-here-is-the-source-tree-plus-only-the-declared-additions
  (repo/refuse-if-not-repo-root!)
  (let [{:keys [source identity]} @migration
        allowed (set (:allowed-additions identity))
        {:keys [revision path tracked-files]} source
        extraction-commit "f591c8f"]
    (is (seq allowed) "migration.edn の :identity :allowed-additions が空")
    ;; 出所に依らずに言えること: 抽出コミットの tree = :tracked-files + 宣言された追加。
    (if-not (repo/tracked-files)
      (skip! "git ls-files unavailable; cannot count the extraction tree")
      (let [at-extraction (try
                            (->> (git repo/root ["ls-tree" "-r" "--name-only" extraction-commit])
                                 str/split-lines (remove str/blank?) set)
                            (catch :default _ nil))]
        (if-not at-extraction
          (skip! (str "extraction commit " extraction-commit
                      " is not reachable here (shallow clone or rewritten history)"))
          (do
            (is (= (+ tracked-files (count allowed)) (count at-extraction))
                (str "抽出コミットの tree は :tracked-files(" tracked-files ") + "
                     ":allowed-additions(" (count allowed) ") = " (+ tracked-files (count allowed))
                     " のはずだが " (count at-extraction) " 件"))
            (doseq [a allowed]
              (is (contains? at-extraction a)
                  (str "宣言された追加 " a " が抽出コミットに無い")))))))))
