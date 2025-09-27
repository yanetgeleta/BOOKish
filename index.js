import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import md5 from "md5"

const app = express();
app.use(express.static("public"));

app.use(bodyParser.urlencoded({extended: true}));

const port = 3000;
const API_KEY = "AIzaSyBRfVMUzVveYlQeKNb5KiFXur31SELSzCA";
const baseUrl = "https://www.googleapis.com/books/v1/volumes";

var reading = [];
var read = [];
var wantToRead = [];
var recommendations = [];
var categories = ["Fiction", "Mystery", "Thriller", "Science Fiction", "Fantasy", "Romance", "Historical Fiction"];

app.get("/", async (req,res)=> {
    if(reading.length) {
        let index = 0;
        while(index < reading.length) {
            if(reading[index].volumeInfo.categories) {
                const exist = categories.find(category=> {
                    return category === reading[index].volumeInfo.categories[0];
                })
                if(!exist) {
                    categories.unshift(reading[index].volumeInfo.categories[0]);
                }
                break;
            } else {
                index++;
            }
        }
    }

    var selectedCategory = categories[Math.floor(Math.random() * categories.length)];
    const category = req.query.category || selectedCategory;
    try {
        const result = await axios.get(baseUrl, {
            params: {
                key: API_KEY,
                q: `subject:${category}`,
                maxResults: 20
            }
        })

        res.render("index.ejs", {
        reading: reading[0],
        categories: categories,
        items:result.data.items,
        category: category
    });
    }
    catch(err) {
        console.error(err.response?.data || err.message);
    }
})

app.post("/", async(req, res)=> {
    const category = req.body.category;
    res.redirect(`/?category=${encodeURIComponent(category)}`);
})

app.get("/search", async (req, res)=> {
    const searchInput = req.query.searchValue;
    if(!searchInput) return res.redirect('/');
    try {
        const result = await axios.get(baseUrl, {
            params: {
                key: API_KEY,
                q: searchInput,
                maxResults: 20
            }
        })
        res.render("search.ejs", {
            values: result.data.items,
            searchInput: searchInput
            // redirectTo: req.originalUrl
        });
    }
    catch(err) {
        console.log(err.response?.data || err.message)
    }
})

app.post("/search", async (req, res)=> {
    const searchInput = req.body.searchValue;
    res.redirect(`/search?searchValue=${encodeURIComponent(searchInput)}`);
})
async function listAdder(req, list, array, id, {first, second}) {
    if(req.body['clicked-result'] === list) {
        try {
            const result = await axios.get(baseUrl+"/"+id, {
                params: {
                    key: API_KEY
                }
            })
            let exists = array.some(arr=> {
                return result.data.id === arr.id;   
            })
            if(!exists) {
                array.unshift(result.data);
                function remover(arr) {
                    const IfIndex = arr.findIndex((book)=> {
                        return book.id === result.data.id;
                    })
                    if(IfIndex !== -1) {
                        arr.splice(IfIndex, 1);
                    }
                }

                remover(first);
                remover(second);
            }
        }
        catch (err) {
            console.log(err.response?.data || err.message);
        }
    }
}
app.post("/update-list", async (req,res)=> {
    const volumeId = req.body['selected-id'];
    if(req.body['clicked-result'] === "notReading") {
        reading.splice(0, 1);
        res.redirect('/');
    }
    await listAdder(req, "wantToRead", wantToRead, volumeId, {first: reading, second: read})
    await listAdder(req, "reading", reading, volumeId, {first: wantToRead, second: read});
    await listAdder(req, "read", read, volumeId, {first: wantToRead, second: reading});
    const searchInput = req.body.searchValue;

    if(req.body.formLocation === "search") {
        res.redirect(`/search?searchValue=${encodeURIComponent(searchInput)}`);
    } else if(req.body.formLocation === "single-book") {
        res.redirect(`/single?bookId=${encodeURIComponent(volumeId)}`)
    } else if(req.body.formLocation === "index") {
        res.redirect("/");
    }
})
app.get("/single", async (req, res)=> {
    const id = req.query.bookId;
    
    try {
        const result = await axios.get(baseUrl+"/"+id, {
            params: {
                key: API_KEY
            }
        })
        if(result.data.volumeInfo.categories) {
            const similarCategory = result.data.volumeInfo.categories[0];
            const result1 = await axios.get(baseUrl, {
                params: {
                    key: API_KEY,
                    q: `subject:${similarCategory}`
                }
             })
             res.render("single-book.ejs", {book: result.data, similarBooks: result1.data.items});
        } else {
            res.render("single-book.ejs", {book: result.data})
        }
    }
    catch (err) {
        console.log(err.response?.data || err.message);
    }
})

app.post("/single", (req, res)=> {
    res.redirect(`/single?bookId=${encodeURIComponent(req.body['single-id'])}`)
})

app.get("/profile", async(req, res)=> {
    const hash = md5('yanetgele@gmail.com');
    const gravatarURL = `https://www.gravatar.com/avatar/${hash}?d=identicon&s=200`;
    const books = reading.length + read.length + wantToRead.length;
    var selectedList = wantToRead;
    var selectedListName = "Want to Read";

    if(req.query.list !== "wantToRead") {
        if(req.query.list === "reading") {
            selectedList = reading;
            selectedListName = "Reading";
        } else if(req.query.list === "read") {
            selectedList = read;
            selectedListName = "Read";
        }
    }

    const data = {
        books: books,
        list: selectedList,
        profilePic: gravatarURL,
        listName: selectedListName
    }

    res.render("profile.ejs", {data});
})
app.post("/profile", (req, res)=> {
    const list = req.body.profileList;
    res.redirect(`/profile?list=v${encodeURIComponent(list)}`);
})

app.listen(port, ()=> {
    console.log(`Server is running on ${port}`)
})