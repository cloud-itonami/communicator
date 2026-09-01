;; documents_test.cljs — 同じことを別々に言っている 4 つの文書を突き合わせる。
;;
;; この repo は、依存する 3 プロジェクトの名前を **3 箇所**（README.md の
;; 「It integrates with」・PROJECT.jsonld の dependsOn・proto の service コメント）で
;; 独立に述べ、構成要素の一覧を **3 箇所**（README.md の High-level architecture・
;; appview/README.md の Planned components・PROJECT.jsonld の dodaf:performer）で
;; 独立に述べ、テストの件数を **1 箇所**（quickstart）で述べている。
;;
;; どれが破れても何も throw しない。quickstart は「every step below was actually
;; executed」と書いているが、**書いた日の測定**であって、次に誰かがテストを 1 件
;; 足した瞬間に静かに嘘になる。
(ns etzhayyim.communicator.documents-test
  (:require [clojure.test :refer [deftest is testing]]
            [clojure.string :as str]
            [etzhayyim.communicator.repo :as repo]))

(def readme (delay (repo/slurp* "README.md")))
(def appview (delay (repo/slurp* "appview/README.md")))
(def quickstart (delay (repo/slurp* "docs/operator-quickstart.md")))
(def project-jsonld (delay (js->clj (js/JSON.parse (repo/slurp* "PROJECT.jsonld")))))
(def proto-text (delay (repo/slurp* "proto/v1/communicator.proto")))
(def vitest-text (delay (repo/slurp* "kotoba/test/communicator.test.ts")))

(defn project-name-from-uri [u] (last (str/split u #"/")))

;; ── 主張 1: 依存の 3 つ組は 3 文書で一致する ────────────────────────

(deftest the-three-dependencies-agree-across-readme-jsonld-and-proto
  (repo/refuse-if-not-repo-root!)
  (let [from-jsonld (set (map project-name-from-uri (get @project-jsonld "dependsOn")))
        from-readme (set (map second (re-seq #"(?m)^- `(etzhayyim-project-[a-z-]+)`" @readme)))
        from-proto  (set (map second (re-seq #"(?m)^//\s*-\s*(etzhayyim-project-[a-z-]+)" @proto-text)))]
    (is (= 3 (count from-jsonld)) "PROJECT.jsonld の dependsOn が 3 件でない")
    (is (= 3 (count from-readme)) "README の integrates-with が 3 件でない")
    (is (= 3 (count from-proto)) "proto の service コメントが挙げる統合先が 3 件でない")
    (is (= from-jsonld from-readme)
        (str "PROJECT.jsonld と README の依存が食い違う。"
             " jsonld のみ=" (pr-str (sort (remove from-readme from-jsonld)))
             " README のみ=" (pr-str (sort (remove from-jsonld from-readme)))))
    (is (= from-jsonld from-proto)
        (str "PROJECT.jsonld と proto の依存が食い違う。"
             " jsonld のみ=" (pr-str (sort (remove from-proto from-jsonld)))
             " proto のみ=" (pr-str (sort (remove from-jsonld from-proto)))))))

;; ── 主張 2: 構成要素の一覧と「まだ無いもの」の印が 3 文書で一致する ──

(defn numbered-components [text]
  (vec (for [[_ nm tail] (re-seq #"(?m)^\d+\. `([a-z-]+-component)`(.*)$" text)]
         {:name nm :planned? (boolean (re-find #"\((?:planned|phase 2)\)" tail))})))

(deftest performers-are-exactly-the-components-that-are-not-marked-planned
  (repo/refuse-if-not-repo-root!)
  (let [r (numbered-components @readme)
        a (numbered-components @appview)
        performers (set (map #(get % "schema:name") (get @project-jsonld "dodaf:performer")))]
    (is (= 4 (count r)) (str "README の構成要素は 4 件のはず。いま " (count r)))
    (is (= 4 (count a)) (str "appview/README の構成要素は 4 件のはず。いま " (count a)))
    (is (= (map :name r) (map :name a))
        (str "README と appview/README で構成要素の名前か順序が食い違う。"
             " README=" (pr-str (map :name r)) " appview=" (pr-str (map :name a))))
    (is (= (set (map :name (filter :planned? r))) (set (map :name (filter :planned? a))))
        "「まだ無い」と印が付いている要素が README と appview で食い違う")
    (is (= 1 (count (filter :planned? r)))
        "planned の印が付いた要素がちょうど 1 件でない（quickstart の Not yet operable 節と対応する）")
    ;; jsonld は「今在るもの」を述べる文書なので、planned は載らない。
    (is (= performers (set (map :name (remove :planned? r))))
        (str "PROJECT.jsonld の performer が『planned でない構成要素』と一致しない。"
             " jsonld のみ=" (pr-str (sort (remove (set (map :name (remove :planned? r))) performers)))
             " README のみ=" (pr-str (sort (remove performers (map :name (remove :planned? r)))))))
    (doseq [{:keys [name]} (filter :planned? r)]
      (is (str/includes? @quickstart name)
          (str "planned な " name " が quickstart の「Not yet operable」で触れられていない")))))

;; ── 主張 3: quickstart が言う件数は、テストファイルの実際の件数である ──

(deftest quickstart-test-count-matches-the-suite-it-describes
  (repo/refuse-if-not-repo-root!)
  (let [actual (count (re-seq #"(?m)^\s*it\(" @vitest-text))
        claimed (set (map second (re-seq #"Tests\s+(\d+) passed" @quickstart)))
        prose (set (map second (re-seq #"The (\d+) tests" @quickstart)))
        all-claims (into claimed prose)]
    (is (pos? actual) "vitest ファイルから `it(` を 1 件も抽出できていない（抽出が壊れている）")
    (is (seq all-claims) "quickstart がテスト件数を主張していない（主張が消えたなら、この検査も見直す）")
    (doseq [c all-claims]
      (is (= actual (js/parseInt c 10))
          (str "quickstart は " c " 件と書いているが、kotoba/test/communicator.test.ts の it は "
               actual " 件。テストを足した側が quickstart を直していない")))))

;; ── 主張 4: 文書が名指しした repo 相対のパスは実在する ───────────────

(def path-extensions
  "『パスらしきもの』の判定に使う拡張子の allowlist。
   これを固定するのは、文書が `gmail.mail.send`（RPC ツール名）や
   `wrpc/xrpc-provider`（外部コンポーネント）のようなパスでない識別子も
   backtick で囲むからで、それらをパスと読むと存在しない指摘が量産される。"
  #{"md" "ts" "tsx" "json" "proto" "edn" "yml" "yaml" "cljs" "cljc" "clj" "jsonld"})

(defn referenced-paths [text]
  (->> (re-seq #"`([^`\n]+)`" text)
       (map second)
       (filter #(re-matches #"[A-Za-z0-9._/-]+" %))
       (remove #(str/starts-with? % "/"))
       (remove #(str/starts-with? % "-"))
       (filter (fn [s]
                 (or (str/ends-with? s "/")
                     (when-let [[_ ext] (re-find #"\.([A-Za-z0-9]+)$" s)]
                       (contains? path-extensions ext)))))
       distinct
       vec))

(def scanned-docs ["README.md" "docs/operator-quickstart.md" "appview/README.md"])

(deftest every-repo-relative-path-named-by-a-document-exists
  (repo/refuse-if-not-repo-root!)
  (let [per-doc (into {} (for [doc scanned-docs] [doc (referenced-paths (repo/slurp* doc))]))
        total (reduce + 0 (map count (vals per-doc)))]
    ;; 床は **文書ごとではなく合計** に置く。appview/README.md は `wrpc/xrpc-provider`
    ;; のような外部コンポーネント名しか backtick で囲んでおらず、repo 相対のパスを
    ;; 1 件も指していないのが正常な状態だからである。文書ごとに床を置くと、
    ;; 規則を守っている側を赤にする。合計の床は、抽出そのものが壊れて全部 0 に
    ;; なったときにだけ鳴る。
    (is (<= 6 total)
        (str "3 文書から抽出できた repo 相対パスの合計が " total
             " 件しかない —— 抽出が壊れている疑い（0 件を『違反なし』と読まない床）"))
    (doseq [doc scanned-docs]
      (testing doc
        (println (str "  [scanned] " doc " → " (count (per-doc doc)) " referenced paths"))
        (doseq [r (per-doc doc)]
          (is (repo/path-exists? r)
              (str doc " が `" r "` を指しているが、この repo に存在しない")))))))

;; ── 主張 5: quickstart の記録表は types.ts の 4 家族と対応する ─────────

(deftest quickstart-record-family-table-matches-the-constants
  (repo/refuse-if-not-repo-root!)
  (let [table-names (set (map second (re-seq #"(?m)^\|\s*`(\w+)`\s*\|" @quickstart)))
        types-text (repo/slurp* "kotoba/src/types.ts")
        nsids (set (map second (re-seq #"export const \w+(?:_COLLECTION|_INNER_TYPE)\s*=\s*\"([^\"]+)\"" types-text)))
        leaf (set (map #(last (str/split % #"\.")) nsids))]
    (is (= 4 (count table-names)) (str "quickstart の表が 4 行でない: " (pr-str (sort table-names))))
    (is (= table-names leaf)
        (str "quickstart の表と types.ts の NSID 末尾が食い違う。"
             " 表のみ=" (pr-str (sort (remove leaf table-names)))
             " 定数のみ=" (pr-str (sort (remove table-names leaf)))))))
