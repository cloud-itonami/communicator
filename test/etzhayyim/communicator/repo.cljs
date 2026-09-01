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
;; 読めなかったことを「問題なし」と混同しないために、ファイルが読めない場合は
;; nil ではなく **例外**にし、runner 側が exit 2（0 でも 1 でもない値）で終わる。
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
