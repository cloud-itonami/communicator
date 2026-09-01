;; repo.cljs — この repo 自身を読むための最小の土台。
;;
;; ここのテストが検査するのは実行時のふるまいではなく、**この repo の中の複数の
;; ファイルが互いについて述べている主張**である。`kotoba/test/communicator.test.ts`
;; （vitest 8 件）は MockEtzhayyim に対する registry の挙動を見ているが、
;; 「types.ts の union は proto の enum を写したものだ」「PROJECT.jsonld の
;; performer は README の構成要素と同じものだ」「quickstart が言う 8 件は本当に
;; 8 件だ」といった**ファイル間の約束**は誰も見ていない。どれが破れても何も
;; throw しない。
;;
;; 読めなかったことを「問題なし」と混同しないために、読めない場合は nil を返さず
;; **例外**にする。行き先は 2 つに分かれる:
;;
;;   * sentinel が揃わない（＝ここは communicator の repo ルートではない）→
;;     runner が答えを出さずに **exit 2**。0 でも 1 でもない値なのは、
;;     「実行できなかった検査」を「実行して問題が無かった検査」と区別するため。
;;   * 個別のファイルが 1 つ無い → cljs.test の error として **exit 1**。
;;     ここで読むファイルはすべて git が追跡しているので、消えているのは
;;     測れない状況ではなく repo 側の欠陥である。
(ns etzhayyim.communicator.repo
  (:require ["fs" :as fs]
            ["path" :as path]
            [clojure.string :as str]))

(def root
  "テストは repo のルートから走る前提。sentinel を 2 つ確かめてから答える ——
   別のディレクトリで走らせて「ファイルが無いので違反 0 件」を返さないため。"
  (js/process.cwd))

(defn- exists? [rel] (fs/existsSync (path/join root rel)))

(def sentinels ["migration.edn" "proto/v1/communicator.proto" "kotoba/src/types.ts"])

(defn refuse-if-not-repo-root!
  "この 3 つが揃っていなければ、答えを出さずに拒否する。"
  []
  (let [missing (vec (remove exists? sentinels))]
    (when (seq missing)
      (throw (ex-info (str "Refusing to report a result: cwd is not the communicator repo root. "
                           "missing=" (pr-str missing) " cwd=" root)
                      {:kind :not-repo-root :missing missing})))))

(defn slurp*
  "読めなければ throw する。nil を返して呼び出し側が「無かった」と読むのを防ぐ。"
  [rel]
  (let [p (path/join root rel)]
    (when-not (fs/existsSync p)
      (throw (ex-info (str "required file is missing: " rel) {:kind :missing-file :path rel})))
    (fs/readFileSync p "utf8")))

(defn path-exists? [rel]
  (exists? (str/replace rel #"/$" "")))

(defn tracked-files
  "git が追跡しているファイル。git が無い環境では nil（呼び出し側が skip する）。"
  []
  (try
    (let [cp (js/require "node:child_process")
          out (.execFileSync cp "git" #js ["ls-files"] #js {:cwd root :encoding "utf8"})]
      (->> (str/split-lines out) (remove str/blank?) vec))
    (catch :default _ nil)))
