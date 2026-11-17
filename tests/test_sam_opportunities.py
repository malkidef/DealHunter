import json, unittest
from scripts.sam_opportunities import normalize_opportunity, fetch_opportunities

class SamTests(unittest.TestCase):
    def test_normalizes_notice_and_excludes_personal_contacts(self):
        row=normalize_opportunity({"noticeId":"abc","title":"Lab equipment","fullParentPathName":"HHS",
            "responseDeadLine":"2026-12-01","placeOfPerformance":{"city":{"name":"Boston"},"state":{"name":"MA"},"country":{"code":"USA"}},
            "pointOfContact":[{"email":"private@example.gov"}]}, "now")
        self.assertEqual(row["source_notice_id"],"abc")
        self.assertEqual(row["place_of_performance"]["city"],"Boston")
        self.assertEqual(row["deadline_date"],"2026-12-01")
        self.assertEqual(row["review_status"],"pending")
        self.assertNotIn("private@example.gov",json.dumps(row))
    def test_ignores_empty_record(self):
        self.assertIsNone(normalize_opportunity({"other":"x"},"now"))
    def test_requires_api_key(self):
        with self.assertRaises(RuntimeError):
            fetch_opportunities("","11/01/2026","11/17/2026")
    def test_pagination_and_page_size(self):
        import scripts.sam_opportunities as sam
        calls=[]
        class Response:
            def __init__(self,p): self.p=p
            def __enter__(self): return self
            def __exit__(self,*a): return False
            def read(self): return json.dumps(self.p).encode()
        old=sam.urlopen
        try:
            def fake(req,timeout):
                from urllib.parse import urlparse,parse_qs
                q=parse_qs(urlparse(req.full_url).query); calls.append(q)
                off=int(q["offset"][0])
                return Response({"totalRecords":3,"opportunitiesData":[{"noticeId":str(off+1)},{"noticeId":str(off+2)}] if off==0 else [{"noticeId":"3"}]})
            sam.urlopen=fake
            rows,total=fetch_opportunities("secret","11/01/2026","11/17/2026",limit=2)
        finally: sam.urlopen=old
        self.assertEqual(len(rows),3); self.assertEqual(total,3)
        self.assertEqual(calls[1]["offset"],["2"])
if __name__=="__main__": unittest.main()
